/**
 * Build dos dados geográficos do AquaGraph.
 *
 *   node scripts/build-geodata.mjs
 *
 * Lê OpenStreetMap (vias, córregos, reservatórios, poços, hospitais, escolas,
 * bairros) e o relevo Copernicus GLO-90 do recorte configurado em
 * `scripts/geodata/config.mjs` e gera três arquivos:
 *
 * - `public/geo/rp-base.json`      camadas do mapa (setores, rede principal,
 *                                  adutoras, córregos, ativos, sensores)
 * - `public/geo/rp-secondary.json` rede secundária (carregada sob demanda)
 * - `src/server/geo/rp-model.json` atributos usados pelo motor de simulação
 *
 * O que é real: geometria de vias, córregos e bairros; posição de caixas
 * d'água, reservatórios, poços, hospitais e escolas; altitude do terreno.
 * O que é derivado/simulado: divisa dos setores (Voronoi entre bairros),
 * traçado da rede (sob as vias), material/idade dos tubos, capacidades,
 * posição dos sensores e parâmetros hidráulicos.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Delaunay } from "d3-delaunay";
import { CITY, LEAK_SECTOR, SECTORS, SYSTEMS } from "./geodata/config.mjs";
import { fetchElevationGrid, fetchOsm, setCacheScope } from "./geodata/fetch.mjs";
import * as G from "./geodata/geometry.mjs";

const t0 = Date.now();
const log = (...args) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args);

setCacheScope(CITY.bbox);
const osm = await fetchOsm(CITY.bbox);
const elevationGrid = await fetchElevationGrid(CITY.bbox, 48, 44);
const elevationAtLL = G.makeGridSampler(elevationGrid);
const elevationAt = (xy) => elevationAtLL(G.toLL(xy));
log("dados carregados");

const toXYPoints = (geometry) => geometry.map((p) => G.toXY([p.lon, p.lat]));
const ll = (xy) => G.llRound(G.toLL(xy));
const llLine = (line) => line.map(ll);
const centerOf = (element) =>
  element.center
    ? G.toXY([element.center.lon, element.center.lat])
    : G.toXY([element.lon, element.lat]);

// ---------------------------------------------------------------------------
// 1. Recorte de estudo
// ---------------------------------------------------------------------------

const [west, south, east, north] = CITY.bbox;
const [xmin, ymin] = G.toXY([west, south]);
const [xmax, ymax] = G.toXY([east, north]);
const chamferX = (xmax - xmin) * 0.16;
const chamferY = (ymax - ymin) * 0.16;
const boundary = [
  [xmin + chamferX, ymin],
  [xmax - chamferX, ymin],
  [xmax, ymin + chamferY],
  [xmax, ymax - chamferY],
  [xmax - chamferX, ymax],
  [xmin + chamferX, ymax],
  [xmin, ymax - chamferY],
  [xmin, ymin + chamferY],
];
const insideBoundary = (xy) => G.pointInPolygon(xy, boundary);

// ---------------------------------------------------------------------------
// 2. Setores de abastecimento (Voronoi entre bairros-semente)
// ---------------------------------------------------------------------------

const places = osm.places.elements
  .filter((element) => element.tags?.name)
  .map((element) => ({ name: element.tags.name, xy: G.toXY([element.lon, element.lat]) }));

const seeds = SECTORS.map((sector) => {
  const matches = places.filter((place) => place.name === sector.seed);
  if (!matches.length) throw new Error(`Bairro-semente não encontrado: ${sector.seed}`);
  matches.sort((a, b) => G.dist(a.xy, [0, 0]) - G.dist(b.xy, [0, 0]));
  return { ...sector, xy: matches[0].xy };
});

const voronoi = Delaunay.from(seeds.map((seed) => seed.xy)).voronoi([
  xmin - 50,
  ymin - 50,
  xmax + 50,
  ymax + 50,
]);

const sectors = seeds.map((seed, index) => {
  const cell = voronoi.cellPolygon(index).slice(0, -1);
  const polygon = G.clipPolygon(cell, boundary);
  const rand = G.seeded(`sector:${seed.id}`);
  const areaKm2 = G.polygonArea(polygon) / 1e6;
  const density = seed.seed === "Centro" ? 8600 : Math.round(5200 + rand() * 2400);
  const population = Math.round((areaKm2 * density) / 10) * 10;
  const neighborhoods = places
    .filter((place) => G.pointInPolygon(place.xy, polygon))
    .map((place) => place.name)
    .filter((name, i, all) => all.indexOf(name) === i);
  const ordered = [seed.seed, ...neighborhoods.filter((name) => name !== seed.seed)];
  return {
    id: seed.id,
    name: seed.seed,
    system: seed.system,
    polygon,
    centroid: G.polygonCentroid(polygon),
    areaKm2,
    population,
    connections: Math.round(population / (seed.seed === "Centro" ? 4.2 : 3.05)),
    neighborhoods: ordered.slice(0, 6),
  };
});

const sectorAt = (xy) => sectors.find((sector) => G.pointInPolygon(xy, sector.polygon))?.id ?? null;

// Estatística de relevo de cada setor a partir da grade.
for (const sector of sectors) {
  const samples = [];
  for (let x = xmin; x <= xmax; x += 120) {
    for (let y = ymin; y <= ymax; y += 120) {
      if (G.pointInPolygon([x, y], sector.polygon)) samples.push(elevationAt([x, y]));
    }
  }
  samples.sort((a, b) => a - b);
  sector.elevation = {
    min: Math.round(samples[0]),
    mean: Math.round(samples.reduce((s, v) => s + v, 0) / samples.length),
    max: Math.round(samples[samples.length - 1]),
  };
}
log("setores", sectors.map((s) => `${s.id}:${s.areaKm2.toFixed(1)}km²`).join(" "));

// ---------------------------------------------------------------------------
// 3. Rede de distribuição sob as vias reais
// ---------------------------------------------------------------------------

const MAJOR_CLASS = { trunk: 300, primary: 300, secondary: 200, tertiary: 150 };

const majorWays = osm.majorRoads.elements
  .filter((way) => way.geometry && MAJOR_CLASS[way.tags?.highway])
  .map((way) => ({
    id: way.id,
    name: way.tags.name ?? null,
    highway: way.tags.highway,
    oneway: way.tags.oneway === "yes",
    elevated:
      Boolean(way.tags.bridge && way.tags.bridge !== "no") ||
      /^(Viaduto|Ponte|Elevado) /.test(way.tags.name ?? ""),
    points: toXYPoints(way.geometry),
  }));

// Grafo viário para traçar as adutoras por caminho mínimo.
const graph = new Map();
const nodeKey = ([x, y]) => `${Math.round(x)}:${Math.round(y)}`;
for (const way of majorWays) {
  for (let i = 1; i < way.points.length; i += 1) {
    const a = way.points[i - 1];
    const b = way.points[i];
    if (!insideBoundary(a) || !insideBoundary(b)) continue;
    const ka = nodeKey(a);
    const kb = nodeKey(b);
    const w = G.dist(a, b);
    if (!graph.has(ka)) graph.set(ka, { xy: a, edges: [] });
    if (!graph.has(kb)) graph.set(kb, { xy: b, edges: [] });
    graph.get(ka).edges.push([kb, w]);
    graph.get(kb).edges.push([ka, w]);
  }
}

// Avenidas de pista dupla aparecem duas vezes no OSM (uma por sentido).
// Mantém só uma das pistas para a rede não ser desenhada em dobro.
function dedupeCarriageways(ways) {
  const kept = [];
  const byName = new Map();
  const sorted = [...ways].sort((a, b) => G.lineLength(b.points) - G.lineLength(a.points));
  for (const way of sorted) {
    if (way.oneway && way.name) {
      const siblings = byName.get(way.name) ?? [];
      const length = G.lineLength(way.points);
      const samples = [];
      for (let f = 0.1; f <= 0.9; f += 0.2) samples.push(G.pointAlong(way.points, f));
      const covered = samples.filter((sample) =>
        siblings.some((sibling) => G.polylineDistance(sample, sibling.points) < 38),
      ).length;
      if (length > 0 && covered / samples.length >= 0.6) continue;
      siblings.push(way);
      byName.set(way.name, siblings);
    }
    kept.push(way);
  }
  return kept;
}

const majorKept = dedupeCarriageways(majorWays);

function pipeAttributes(seedText, diameter, isMain) {
  const rand = G.seeded(seedText);
  const year = Math.round(1962 + rand() * 58);
  let material;
  if (year < 1978)
    material = isMain ? "Ferro fundido" : rand() < 0.55 ? "Cimento-amianto" : "Ferro fundido";
  else if (year < 1998) material = isMain ? "Ferro fundido dúctil" : "PVC PBA";
  else material = isMain ? "PEAD" : rand() < 0.5 ? "PEAD" : "PVC PBA";
  return { diameter, material, year };
}

const pipes = [];
for (const way of majorKept) {
  for (const piece of G.clipLine(way.points, boundary)) {
    const simplified = G.simplify(piece, 2.5);
    G.splitLine(simplified, 450).forEach((segment, index) => {
      const length = G.lineLength(segment);
      if (length < 25) return;
      const mid = G.pointAlong(segment, 0.5);
      pipes.push({
        cls: "main",
        line: segment,
        mid,
        length,
        street: way.name,
        sector: sectorAt(mid),
        ...pipeAttributes(`m:${way.id}:${index}`, MAJOR_CLASS[way.highway], true),
      });
    });
  }
}

const minorWays = osm.minorRoads.elements.filter((way) => way.geometry);
for (const way of minorWays) {
  const points = toXYPoints(way.geometry);
  for (const piece of G.clipLine(points, boundary)) {
    const simplified = G.simplify(piece, 2);
    G.splitLine(simplified, 380).forEach((segment, index) => {
      const length = G.lineLength(segment);
      if (length < 20) return;
      const mid = G.pointAlong(segment, 0.5);
      const rand = G.seeded(`dn:${way.id}`);
      pipes.push({
        cls: "sec",
        line: segment,
        mid,
        length,
        street: way.tags?.name ?? null,
        sector: sectorAt(mid),
        ...pipeAttributes(`s:${way.id}:${index}`, rand() < 0.7 ? 75 : 100, false),
      });
    });
  }
}

// Identificadores por setor ("14B-481"), numerados de noroeste para sudeste.
for (const sector of sectors) {
  const own = pipes.filter((pipe) => pipe.sector === sector.id);
  own.sort((a, b) => b.mid[1] - a.mid[1] || a.mid[0] - b.mid[0]);
  own.forEach((pipe, index) => {
    pipe.id = `${sector.id.replace("-", "")}-${String(101 + index)}`;
  });
}
const networkPipes = pipes.filter((pipe) => pipe.sector);
log(
  "tubulações",
  networkPipes.length,
  "km",
  (networkPipes.reduce((s, p) => s + p.length, 0) / 1000).toFixed(0),
);

// ---------------------------------------------------------------------------
// 4. Reservatórios e poços (posições reais do OSM)
// ---------------------------------------------------------------------------

const reservoirsRaw = osm.waterInfra.elements
  .filter((element) =>
    ["water_tower", "storage_tank", "reservoir_covered"].includes(element.tags?.man_made),
  )
  .map((element) => ({ element, xy: centerOf(element) }))
  .filter((item) => insideBoundary(item.xy));

const reservoirs = [];
for (const item of reservoirsRaw) {
  const twin = reservoirs.find((existing) => G.dist(existing.xy, item.xy) < 90);
  if (twin) {
    twin.units += 1;
    continue;
  }
  reservoirs.push({ ...item, units: 1 });
}
reservoirs.sort((a, b) => b.xy[1] - a.xy[1] || a.xy[0] - b.xy[0]);

const nearestPlaceName = (xy) =>
  [...places].sort((a, b) => G.dist(a.xy, xy) - G.dist(b.xy, xy))[0]?.name ?? CITY.name;

const reservoirList = reservoirs
  .map((item, index) => {
    const tags = item.element.tags;
    const elevated = tags.man_made === "water_tower";
    const rand = G.seeded(`res:${item.element.id}`);
    const capacity = elevated
      ? Math.round((250 + rand() * 950) / 50) * 50
      : Math.round(((1800 + rand() * 4200) * item.units) / 100) * 100;
    const ground = elevationAt(item.xy);
    const sector = sectorAt(item.xy);
    return {
      id: `R-${String(index + 1).padStart(2, "0")}`,
      kind: elevated ? "elevado" : "apoiado",
      name: `${elevated ? "Reservatório elevado" : "Reservatório apoiado"} · ${nearestPlaceName(item.xy)}`,
      osmName: tags.name ?? null,
      osmId: `${item.element.type}/${item.element.id}`,
      xy: item.xy,
      capacity,
      groundElevation: Math.round(ground),
      head: Math.round(ground + (elevated ? 24 : 7)),
      sector,
      system: sectors.find((s) => s.id === sector)?.system ?? null,
    };
  })
  .filter((reservoir) => reservoir.sector);

const wells = osm.waterInfra.elements
  .filter((element) => element.tags?.man_made === "water_well")
  .map((element) => ({ element, xy: centerOf(element) }))
  .filter((item) => insideBoundary(item.xy))
  .map((item, index) => ({
    id: `P-${String(index + 1).padStart(2, "0")}`,
    name: "Poço profundo · Aquífero Guarani",
    osmId: `${item.element.type}/${item.element.id}`,
    xy: item.xy,
    sector: sectorAt(item.xy),
  }));
log("reservatórios", reservoirList.length, "poços", wells.length);

// ---------------------------------------------------------------------------
// 5. Adutoras: do centro de reservação de cada sistema até cada setor
// ---------------------------------------------------------------------------

function nearestNode(xy) {
  let best = null;
  let bestDistance = Infinity;
  for (const [key, node] of graph) {
    const d = G.dist(node.xy, xy);
    if (d < bestDistance) {
      bestDistance = d;
      best = key;
    }
  }
  return best;
}

function shortestPath(fromKey, toKey) {
  const distance = new Map([[fromKey, 0]]);
  const previous = new Map();
  const visited = new Set();
  // Fila de prioridade simples (heap binário).
  const heap = [[0, fromKey]];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, key] = pop();
    if (visited.has(key)) continue;
    visited.add(key);
    if (key === toKey) break;
    for (const [next, w] of graph.get(key).edges) {
      const nd = d + w;
      if (nd < (distance.get(next) ?? Infinity)) {
        distance.set(next, nd);
        previous.set(next, key);
        push([nd, next]);
      }
    }
  }
  if (!previous.has(toKey) && fromKey !== toKey) return null;
  const path = [toKey];
  while (path[0] !== fromKey) path.unshift(previous.get(path[0]));
  return path.map((key) => graph.get(key).xy);
}

const systemSources = SYSTEMS.map((system) => {
  const candidates = reservoirList.filter((reservoir) => reservoir.system === system.id);
  // Centro de reservação: o reservatório apoiado de maior capacidade (ou o mais alto).
  candidates.sort(
    (a, b) =>
      (b.kind === "apoiado") - (a.kind === "apoiado") || b.capacity - a.capacity || b.head - a.head,
  );
  return { ...system, source: candidates[0] };
});

const trunkMains = [];
const sectorInlets = new Map();
const usedEdges = new Set();
for (const system of systemSources) {
  if (!system.source) continue;
  const fromKey = nearestNode(system.source.xy);
  for (const sector of sectors.filter((s) => s.system === system.id)) {
    const toKey = nearestNode(sector.centroid);
    const path = shortestPath(fromKey, toKey);
    if (!path || path.length < 2) continue;
    const inletIndex = path.findIndex((xy) => G.pointInPolygon(xy, sector.polygon));
    const inlet =
      inletIndex > 0
        ? path[inletIndex]
        : G.pointAlong(path, Math.min(0.35, 600 / G.lineLength(path)));
    sectorInlets.set(sector.id, inlet);
    // Divide o caminho em trechos ainda não usados para não sobrepor adutoras.
    let run = [];
    for (let i = 1; i < path.length; i += 1) {
      const key = [nodeKey(path[i - 1]), nodeKey(path[i])].sort().join("|");
      if (usedEdges.has(key)) {
        if (run.length >= 2) trunkMains.push({ system: system.id, line: run, sector: sector.id });
        run = [];
        continue;
      }
      usedEdges.add(key);
      if (!run.length) run.push(path[i - 1]);
      run.push(path[i]);
    }
    if (run.length >= 2) trunkMains.push({ system: system.id, line: run, sector: sector.id });
  }
}
trunkMains.forEach((main, index) => {
  const rand = G.seeded(`ad:${index}`);
  main.id = `AD-${String(index + 1).padStart(2, "0")}`;
  main.line = G.simplify(main.line, 3);
  main.length = G.lineLength(main.line);
  main.diameter = [400, 500, 600][Math.floor(rand() * 3)];
  main.material = rand() < 0.6 ? "Ferro fundido dúctil" : "Aço carbono";
  main.year = Math.round(1978 + rand() * 38);
});
log("adutoras", trunkMains.length);

// ---------------------------------------------------------------------------
// 6. Córregos e galerias (OSM) e suscetibilidade a alagamento (relevo)
// ---------------------------------------------------------------------------

const streams = [];
for (const way of osm.waterways.elements.filter((w) => w.geometry)) {
  const points = toXYPoints(way.geometry);
  const culvert =
    ["culvert", "yes", "flooded"].includes(way.tags?.tunnel) || Number(way.tags?.layer) < 0;
  for (const piece of G.clipLine(points, boundary)) {
    const line = G.simplify(piece, 3);
    if (G.lineLength(line) < 40) continue;
    streams.push({
      name: way.tags?.name ?? "Córrego sem nome",
      kind: culvert ? "galeria" : "aberto",
      waterway: way.tags?.waterway,
      line,
    });
  }
}

// Amostras ao longo dos córregos, com altitude, para a análise de relevo.
const streamSamples = [];
for (const stream of streams) {
  const length = G.lineLength(stream.line);
  const steps = Math.max(2, Math.round(length / 40));
  for (let i = 0; i <= steps; i += 1) {
    const xy = G.pointAlong(stream.line, i / steps);
    streamSamples.push({ xy, z: elevationAt(xy), name: stream.name });
  }
}
const zStreamMin = Math.min(...streamSamples.map((s) => s.z));
const zStreamMax = Math.max(...streamSamples.map((s) => s.z));

function nearestStream(xy) {
  let best = null;
  let bestDistance = Infinity;
  for (const sample of streamSamples) {
    const d = (sample.xy[0] - xy[0]) ** 2 + (sample.xy[1] - xy[1]) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = sample;
    }
  }
  return { sample: best, distance: Math.sqrt(bestDistance) };
}

/**
 * Suscetibilidade (0–1): combina altura acima da drenagem mais próxima
 * (HAND), distância ao córrego e posição na bacia (trechos mais baixos
 * recebem mais água de montante).
 */
function susceptibility(xy) {
  if (!insideBoundary(xy)) return { value: 0, stream: null };
  const { sample, distance } = nearestStream(xy);
  const hand = Math.max(0, elevationAt(xy) - sample.z);
  const lowness = (zStreamMax - sample.z) / (zStreamMax - zStreamMin);
  const value = Math.exp(-hand / 3.2) * Math.exp(-distance / 650) * (0.3 + 0.7 * lowness);
  return { value, stream: sample };
}

const FLOOD_COLS = 92;
const FLOOD_ROWS = 82;
const floodValues = new Array(FLOOD_COLS * FLOOD_ROWS);
const floodCells = [];
for (let r = 0; r < FLOOD_ROWS; r += 1) {
  for (let c = 0; c < FLOOD_COLS; c += 1) {
    const lon = west + ((east - west) * (c + 0.5)) / FLOOD_COLS;
    const lat = north - ((north - south) * (r + 0.5)) / FLOOD_ROWS;
    const xy = G.toXY([lon, lat]);
    const { value, stream } = susceptibility(xy);
    floodValues[r * FLOOD_COLS + c] = Math.round(Math.min(1, value) * 100);
    if (stream) floodCells.push({ xy, z: elevationAt(xy), stream: stream.name });
  }
}
const cellAreaKm2 = (((xmax - xmin) / FLOOD_COLS) * ((ymax - ymin) / FLOOD_ROWS)) / 1e6;
log("grade de suscetibilidade", FLOOD_COLS, "x", FLOOD_ROWS);

// ---------------------------------------------------------------------------
// 7. Pontos críticos de alagamento (vias reais junto aos córregos)
// ---------------------------------------------------------------------------

const abbreviate = (name) =>
  name
    ?.replace(/^Avenida /, "Av. ")
    .replace(/^Rua /, "R. ")
    .replace(/^Praça /, "Pça. ")
    .replace(/^Alameda /, "Al. ") ?? null;

const hotspotCandidates = [];
for (const way of majorKept.filter((w) => w.name && !w.elevated)) {
  const length = G.lineLength(way.points);
  const steps = Math.max(1, Math.round(length / 35));
  for (let i = 0; i <= steps; i += 1) {
    const xy = G.pointAlong(way.points, i / steps);
    if (!insideBoundary(xy)) continue;
    const { sample, distance } = nearestStream(xy);
    if (distance > 160) continue;
    const { value } = susceptibility(xy);
    const classWeight = way.highway === "primary" || way.highway === "trunk" ? 1 : 0.85;
    hotspotCandidates.push({
      xy,
      score: value * classWeight,
      street: way.name,
      stream: sample.name,
    });
  }
}
hotspotCandidates.sort((a, b) => b.score - a.score);
const hotspots = [];
for (const candidate of hotspotCandidates) {
  if (hotspots.length >= 5) break;
  if (hotspots.some((h) => G.dist(h.xy, candidate.xy) < 850)) continue;
  if (hotspots.some((h) => h.street === candidate.street)) continue;
  hotspots.push(candidate);
}

const hotspotList = hotspots.map((hotspot, index) => {
  const rand = G.seeded(`hot:${index}:${hotspot.street}`);
  const z = elevationAt(hotspot.xy);
  const contributing = floodCells.filter(
    (cell) => cell.stream === hotspot.stream && cell.z > z && G.dist(cell.xy, hotspot.xy) < 4200,
  );
  const area = Math.min(14, Math.max(0.9, contributing.length * cellAreaKm2));
  const flowLength = Math.min(
    6500,
    Math.max(1400, Math.max(...contributing.map((cell) => G.dist(cell.xy, hotspot.xy)), 1400)),
  );
  const zHigh = contributing.length
    ? contributing.map((cell) => cell.z).sort((a, b) => a - b)[
        Math.floor(contributing.length * 0.95)
      ]
    : z + 25;
  const slope = Math.min(0.05, Math.max(0.004, (zHigh - z) / flowLength));
  // Kirpich: tempo de concentração em minutos.
  const tc = 0.0195 * flowLength ** 0.77 * slope ** -0.385;
  const runoff = Math.round((0.74 + rand() * 0.12) * 100) / 100;
  const designIntensity = Math.round(36 + rand() * 12);
  const capacity = (runoff * designIntensity * area) / 3.6;
  return {
    id: `AL-${String(index + 1).padStart(2, "0")}`,
    name: abbreviate(hotspot.street),
    street: hotspot.street,
    stream: hotspot.stream,
    xy: hotspot.xy,
    sector: sectorAt(hotspot.xy),
    elevation: Math.round(z),
    susceptibility: Math.round(hotspot.score * 100) / 100,
    catchmentKm2: Math.round(area * 100) / 100,
    flowLength: Math.round(flowLength),
    slope: Math.round(slope * 10000) / 10000,
    tcMinutes: Math.round(tc),
    runoff,
    designIntensity,
    capacity: Math.round(capacity * 10) / 10,
    gallery: `Galeria ${200 + Math.round(rand() * 60)}`,
  };
});
log("pontos de alagamento", hotspotList.map((h) => `${h.name} (${h.stream})`).join(" | "));

// ---------------------------------------------------------------------------
// 8. Infraestrutura crítica (hospitais, terminal, bombeiros, escolas próximas)
// ---------------------------------------------------------------------------

const facilityKind = {
  hospital: "Hospital",
  clinic: "Unidade de saúde",
  school: "Escola",
  bus_station: "Terminal rodoviário",
  fire_station: "Corpo de Bombeiros",
};
const facilitiesAll = osm.facilities.elements
  .filter((element) => element.tags?.name && facilityKind[element.tags.amenity])
  .map((element) => ({
    osmId: `${element.type}/${element.id}`,
    name: element.tags.name,
    amenity: element.tags.amenity,
    kind: facilityKind[element.tags.amenity],
    xy: centerOf(element),
  }))
  .filter((facility) => insideBoundary(facility.xy))
  // O OSM às vezes tem o mesmo equipamento como ponto e como área.
  .filter(
    (facility, index, all) =>
      all.findIndex(
        (other) => other.name === facility.name && G.dist(other.xy, facility.xy) < 400,
      ) === index,
  );

const facilities = facilitiesAll
  .filter((facility) => {
    const nearHotspot = hotspotList.some((h) => G.dist(h.xy, facility.xy) < 1100);
    if (
      facility.amenity === "hospital" ||
      facility.amenity === "bus_station" ||
      facility.amenity === "fire_station"
    )
      return true;
    return nearHotspot && facility.amenity === "school";
  })
  .map((facility, index) => ({
    ...facility,
    id: `IC-${String(index + 1).padStart(2, "0")}`,
    sector: sectorAt(facility.xy),
  }));

for (const hotspot of hotspotList) {
  hotspot.nearbyFacilities = facilities
    .map((facility) => ({ id: facility.id, distance: G.dist(facility.xy, hotspot.xy) }))
    .filter((item) => item.distance < 1100)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((item) => ({ id: item.id, distance: Math.round(item.distance) }));
}
log("infraestrutura crítica", facilities.length);

// ---------------------------------------------------------------------------
// 9. Sensores (simulados, em posições plausíveis da rede real)
// ---------------------------------------------------------------------------

const sensors = [];
const addSensor = (sensor) => sensors.push({ ...sensor, z: Math.round(elevationAt(sensor.xy)) });

// Macromedidores de vazão na entrada de cada setor.
sectors.forEach((sector, index) => {
  const inlet = sectorInlets.get(sector.id) ?? sector.centroid;
  addSensor({
    id: `VZ-${String(index + 1).padStart(2, "0")}`,
    type: "flow",
    xy: inlet,
    sector: sector.id,
    target: sector.id,
  });
});

// Pressão: ponto crítico (mais alto) de cada setor + pontos extras no setor
// do cenário de vazamento e no Centro.
let psIndex = 1;
for (const sector of sectors) {
  const nodes = networkPipes
    .filter((pipe) => pipe.sector === sector.id && pipe.cls === "main")
    .map((pipe) => pipe.mid);
  if (!nodes.length) continue;
  const byHeight = [...nodes].sort((a, b) => elevationAt(b) - elevationAt(a));
  const chosen = [byHeight[0]];
  const extra = sector.id === LEAK_SECTOR ? 2 : sector.name === "Centro" ? 1 : 0;
  for (let k = 0; k < extra; k += 1) {
    const far = [...nodes].sort(
      (a, b) =>
        Math.min(...chosen.map((c) => G.dist(c, b))) - Math.min(...chosen.map((c) => G.dist(c, a))),
    )[0];
    chosen.push(far);
  }
  for (const xy of chosen) {
    addSensor({
      id: `PS-${String(psIndex).padStart(2, "0")}`,
      type: "pressure",
      xy,
      sector: sector.id,
      target: sector.id,
    });
    psIndex += 1;
  }
}

// Nível: os dois maiores reservatórios de cada sistema.
let nvIndex = 1;
for (const system of SYSTEMS) {
  const own = reservoirList
    .filter((r) => r.system === system.id)
    .sort((a, b) => b.capacity - a.capacity);
  for (const reservoir of own.slice(0, 2)) {
    addSensor({
      id: `NV-${String(nvIndex).padStart(2, "0")}`,
      type: "level",
      xy: reservoir.xy,
      sector: reservoir.sector,
      target: reservoir.id,
    });
    nvIndex += 1;
  }
}

// Pluviômetros: um por sistema, no equipamento público mais central.
SYSTEMS.forEach((system, index) => {
  const own = sectors.filter((s) => s.system === system.id);
  const center = [
    own.reduce((s, sec) => s + sec.centroid[0], 0) / own.length,
    own.reduce((s, sec) => s + sec.centroid[1], 0) / own.length,
  ];
  const host = [...facilitiesAll].sort((a, b) => G.dist(a.xy, center) - G.dist(b.xy, center))[0];
  addSensor({
    id: `PL-${String(index + 1).padStart(2, "0")}`,
    type: "rain",
    xy: host && G.dist(host.xy, center) < 1500 ? host.xy : center,
    sector: sectorAt(host?.xy ?? center),
    target: system.id,
    host: host?.name ?? null,
  });
});

// Réguas de nível nos córregos, a montante dos três pontos mais críticos.
hotspotList.slice(0, 3).forEach((hotspot, index) => {
  const upstream = streamSamples
    .filter((s) => s.name === hotspot.stream && s.z > hotspot.elevation)
    .sort(
      (a, b) => Math.abs(G.dist(a.xy, hotspot.xy) - 220) - Math.abs(G.dist(b.xy, hotspot.xy) - 220),
    )[0];
  const xy = upstream?.xy ?? hotspot.xy;
  addSensor({
    id: `RL-${String(index + 1).padStart(2, "0")}`,
    type: "river",
    xy,
    sector: sectorAt(xy),
    target: hotspot.id,
    stream: hotspot.stream,
  });
});
log("sensores", sensors.length);

// ---------------------------------------------------------------------------
// 10. Active Sensing: pontos da rede e locais candidatos
// ---------------------------------------------------------------------------

// Amostras a cada ~210 m de tubulação, agregadas em células de 200 m: cada
// célula vira um ponto no centro de massa, com o peso somado (trechos
// principais pesam mais). O processo gaussiano usa correlação de ~1,1 km,
// então essa resolução basta — e o custo do cálculo cai várias vezes.
const SENSING_CELL = 200;
const sensingCells = new Map();
for (const pipe of networkPipes) {
  const steps = Math.max(1, Math.round(pipe.length / 210));
  const weight = pipe.cls === "main" ? 16 : 10;
  const sectorIndex = SECTORS.findIndex((s) => s.id === pipe.sector);
  for (let i = 0; i < steps; i += 1) {
    const [x, y] = G.pointAlong(pipe.line, (i + 0.5) / steps);
    const key = `${Math.floor(x / SENSING_CELL)}:${Math.floor(y / SENSING_CELL)}`;
    const cell = sensingCells.get(key) ?? { x: 0, y: 0, w: 0, sectors: new Map() };
    cell.x += x * weight;
    cell.y += y * weight;
    cell.w += weight;
    cell.sectors.set(sectorIndex, (cell.sectors.get(sectorIndex) ?? 0) + weight);
    sensingCells.set(key, cell);
  }
}
const sensingPoints = [...sensingCells.values()].map((cell) => [
  Math.round(cell.x / cell.w),
  Math.round(cell.y / cell.w),
  cell.w,
  [...cell.sectors.entries()].sort((a, b) => b[1] - a[1])[0][0],
]);
const networkSensors = sensors.filter((s) => s.type === "pressure" || s.type === "flow");
const candidates = [];
for (const pipe of networkPipes.filter((p) => p.cls === "main")) {
  if (networkSensors.some((s) => G.dist(s.xy, pipe.mid) < 300)) continue;
  if (candidates.some((c) => G.dist(c.xy, pipe.mid) < 420)) continue;
  candidates.push({ xy: pipe.mid, sector: pipe.sector, street: pipe.street });
}
log("pontos de sensing", sensingPoints.length, "candidatos", candidates.length);

// ---------------------------------------------------------------------------
// 11. Cenário de vazamento: trecho antigo de rede secundária no setor-alvo
// ---------------------------------------------------------------------------

// O vazamento do cenário fica a algumas centenas de metros do primeiro
// sensor de pressão do setor — o caso típico em que a telemetria consegue
// apontar a zona provável.
const leakPipes = networkPipes.filter((pipe) => pipe.sector === LEAK_SECTOR);
const anchor = sensors.find((s) => s.type === "pressure" && s.sector === LEAK_SECTOR);
const oldPipes = leakPipes
  .filter((pipe) => pipe.cls === "sec" && pipe.year < 1982)
  .map((pipe) => ({ pipe, d: anchor ? G.dist(pipe.mid, anchor.xy) : 0 }))
  .filter((item) => item.d > 260 && item.d < 520)
  .sort((a, b) => a.pipe.year - b.pipe.year || a.d - b.d);
const leakPipe = oldPipes[0]?.pipe ?? leakPipes[0];
log("vazamento em", leakPipe.id, leakPipe.material, leakPipe.year, leakPipe.street);

// ---------------------------------------------------------------------------
// 12. Saída
// ---------------------------------------------------------------------------

const xyRound = ([x, y]) => [Math.round(x), Math.round(y)];

const base = {
  generatedAt: new Date().toISOString(),
  attribution: "© OpenStreetMap contributors (ODbL) · Relevo: Copernicus GLO-90 via Open-Meteo",
  city: { name: CITY.name, state: CITY.state, center: CITY.center, bbox: CITY.bbox },
  boundary: boundary.map(ll),
  sectors: sectors.map((sector) => ({
    id: sector.id,
    name: sector.name,
    system: sector.system,
    neighborhoods: sector.neighborhoods,
    centroid: ll(sector.centroid),
    polygon: sector.polygon.map(ll),
  })),
  network: {
    type: "FeatureCollection",
    features: [
      ...trunkMains.map((main) => ({
        type: "Feature",
        properties: {
          id: main.id,
          c: "trunk",
          d: main.diameter,
          m: main.material,
          y: main.year,
          s: main.sector,
          sys: main.system,
        },
        geometry: { type: "LineString", coordinates: llLine(main.line) },
      })),
      ...networkPipes
        .filter((pipe) => pipe.cls === "main")
        .map((pipe) => ({
          type: "Feature",
          properties: {
            id: pipe.id,
            c: "main",
            d: pipe.diameter,
            m: pipe.material,
            y: pipe.year,
            s: pipe.sector,
            st: pipe.street,
          },
          geometry: { type: "LineString", coordinates: llLine(pipe.line) },
        })),
    ],
  },
  streams: {
    type: "FeatureCollection",
    features: streams.map((stream) => ({
      type: "Feature",
      properties: { n: stream.name, k: stream.kind, w: stream.waterway },
      geometry: { type: "LineString", coordinates: llLine(stream.line) },
    })),
  },
  reservoirs: reservoirList.map(({ xy, ...rest }) => ({ ...rest, lngLat: ll(xy) })),
  wells: wells.map(({ xy, ...rest }) => ({ ...rest, lngLat: ll(xy) })),
  facilities: facilities.map(({ xy, ...rest }) => ({ ...rest, lngLat: ll(xy) })),
  hotspots: hotspotList.map((h) => ({
    id: h.id,
    name: h.name,
    street: h.street,
    stream: h.stream,
    sector: h.sector,
    gallery: h.gallery,
    lngLat: ll(h.xy),
  })),
  sensors: sensors.map(({ xy, z, ...rest }) => ({ ...rest, elevation: z, lngLat: ll(xy) })),
  candidates: candidates.map((c) => ({ lngLat: ll(c.xy), sector: c.sector, street: c.street })),
};

const secondary = {
  type: "FeatureCollection",
  features: networkPipes
    .filter((pipe) => pipe.cls === "sec")
    .map((pipe) => ({
      type: "Feature",
      properties: {
        id: pipe.id,
        c: "sec",
        d: pipe.diameter,
        m: pipe.material,
        y: pipe.year,
        s: pipe.sector,
        st: pipe.street,
      },
      geometry: { type: "LineString", coordinates: llLine(pipe.line) },
    })),
};

const materials = [...new Set(networkPipes.map((pipe) => pipe.material))];
const streetNames = [...new Set(networkPipes.map((pipe) => pipe.street).filter(Boolean))];

const sectorNetwork = (id, cls) =>
  Math.round(
    networkPipes.filter((p) => p.sector === id && p.cls === cls).reduce((s, p) => s + p.length, 0) /
      100,
  ) / 10;

const model = {
  generatedAt: base.generatedAt,
  city: { ...CITY, projectionCenter: CITY.center },
  systems: systemSources.map((system) => ({
    id: system.id,
    name: system.name,
    source: system.source?.id ?? null,
  })),
  sectors: sectors.map((sector) => ({
    id: sector.id,
    name: sector.name,
    system: sector.system,
    neighborhoods: sector.neighborhoods,
    centroid: xyRound(sector.centroid),
    areaKm2: Math.round(sector.areaKm2 * 100) / 100,
    population: sector.population,
    connections: sector.connections,
    elevation: sector.elevation,
    networkKm: { main: sectorNetwork(sector.id, "main"), sec: sectorNetwork(sector.id, "sec") },
    inlet: xyRound(sectorInlets.get(sector.id) ?? sector.centroid),
    reservoirs: reservoirList.filter((r) => r.sector === sector.id).map((r) => r.id),
    polygon: sector.polygon.map(xyRound),
  })),
  reservoirs: reservoirList.map(({ xy, ...rest }) => ({ ...rest, xy: xyRound(xy) })),
  trunkMains: trunkMains.map((main) => ({
    id: main.id,
    system: main.system,
    sector: main.sector,
    diameter: main.diameter,
    lengthKm: Math.round(main.length / 10) / 100,
  })),
  sensors: sensors.map((sensor) => ({ ...sensor, xy: xyRound(sensor.xy) })),
  hotspots: hotspotList.map((h) => ({ ...h, xy: xyRound(h.xy) })),
  facilities: facilities.map(({ xy, ...rest }) => ({ ...rest, xy: xyRound(xy) })),
  leak: {
    sector: LEAK_SECTOR,
    pipeId: leakPipe.id,
    xy: xyRound(leakPipe.mid),
    street: leakPipe.street,
  },
  // Atributos de todos os trechos, em tuplas compactas com dicionários:
  // [id, classe (0 principal | 1 secundária), DN, material, ano, comprimento, x, y, rua]
  materials,
  streets: streetNames,
  pipes: networkPipes.map((pipe) => [
    pipe.id,
    pipe.cls === "main" ? 0 : 1,
    pipe.diameter,
    materials.indexOf(pipe.material),
    pipe.year,
    Math.round(pipe.length),
    Math.round(pipe.mid[0]),
    Math.round(pipe.mid[1]),
    pipe.street ? streetNames.indexOf(pipe.street) : -1,
  ]),
  floodGrid: { bbox: CITY.bbox, cols: FLOOD_COLS, rows: FLOOD_ROWS, values: floodValues },
  sensing: {
    points: sensingPoints,
    candidates: candidates.map((c) => ({ xy: xyRound(c.xy), sector: c.sector, street: c.street })),
  },
  totals: {
    networkKm: Math.round(networkPipes.reduce((s, p) => s + p.length, 0) / 1000),
    trunkKm: Math.round(trunkMains.reduce((s, m) => s + m.length, 0) / 100) / 10,
    population: sectors.reduce((s, sec) => s + sec.population, 0),
    connections: sectors.reduce((s, sec) => s + sec.connections, 0),
  },
};

await mkdir(path.resolve("public/geo"), { recursive: true });
await mkdir(path.resolve("src/server/geo"), { recursive: true });
await writeFile(path.resolve("public/geo/rp-base.json"), JSON.stringify(base));
await writeFile(path.resolve("public/geo/rp-secondary.json"), JSON.stringify(secondary));
await writeFile(path.resolve("src/server/geo/rp-model.json"), JSON.stringify(model));

const size = (value) => `${(JSON.stringify(value).length / 1024).toFixed(0)} KB`;
log(
  "rp-base.json",
  size(base),
  "· rp-secondary.json",
  size(secondary),
  "· rp-model.json",
  size(model),
);
