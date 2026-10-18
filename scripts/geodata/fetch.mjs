/**
 * Download (com cache local) dos dados abertos usados no recorte:
 * OpenStreetMap via Overpass e relevo via Open-Meteo Elevation (Copernicus
 * DEM GLO-90). O cache fica em `scripts/.geodata-cache/` e permite rodar o
 * build de novo sem rede.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { OVERPASS_ENDPOINTS } from "./config.mjs";

const CACHE_DIR = path.resolve("scripts/.geodata-cache");
const USER_AGENT = "AquaGraph-prototype/1.0 (geodata build; open data)";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * O nome do arquivo de cache inclui o recorte: trocar a cidade em config.mjs
 * não reaproveita, sem aviso, os dados do recorte anterior.
 */
let cacheScope = "";
export function setCacheScope(bbox) {
  cacheScope = bbox.map((v) => v.toFixed(4)).join("_");
}

async function cached(name, produce) {
  const file = path.join(CACHE_DIR, cacheScope ? `${cacheScope}--${name}` : name);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  const data = await produce();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(data));
  return data;
}

async function overpass(query) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ data: query }),
        });
        const text = await response.text();
        if (!response.ok || !text.trimStart().startsWith("{")) {
          throw new Error(`${endpoint} → HTTP ${response.status}: ${text.slice(0, 120)}`);
        }
        const json = JSON.parse(text);
        if (json.remark && /error|timed out/i.test(json.remark)) throw new Error(json.remark);
        return json;
      } catch (error) {
        lastError = error;
        console.warn(`  overpass falhou (${endpoint}): ${error.message.slice(0, 140)}`);
      }
    }
    await sleep(4000 * (attempt + 1));
  }
  throw lastError;
}

/** bbox no formato Overpass: (sul, oeste, norte, leste). */
function ob([west, south, east, north], margin = 0) {
  return `(${south - margin},${west - margin},${north + margin},${east + margin})`;
}

export async function fetchOsm(bbox) {
  const b = ob(bbox, 0.004);
  const q = (body) => `[out:json][timeout:180];${body}`;

  const majorRoads = await cached("major-roads.json", () =>
    overpass(
      q(
        `way["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"]${b};out tags geom;`,
      ),
    ),
  );
  const minorRoads = await cached("minor-roads.json", () =>
    overpass(q(`way["highway"~"^(residential|unclassified|living_street)$"]${b};out tags geom;`)),
  );
  const waterways = await cached("waterways.json", () =>
    overpass(q(`way["waterway"~"^(river|stream|canal|drain)$"]${ob(bbox, 0.03)};out tags geom;`)),
  );
  const waterInfra = await cached("water-infra.json", () =>
    overpass(
      q(
        `(nwr["man_made"~"^(water_tower|storage_tank|reservoir_covered|water_well|water_works|pumping_station)$"]${b};nwr["landuse"="reservoir"]${b};);out tags center;`,
      ),
    ),
  );
  const facilities = await cached("facilities.json", () =>
    overpass(
      q(
        `(nwr["amenity"~"^(hospital|school|bus_station|fire_station|clinic)$"]${b};);out tags center;`,
      ),
    ),
  );
  const places = await cached("places.json", () =>
    overpass(q(`node["place"~"^(suburb|neighbourhood|quarter)$"]${ob(bbox, 0.02)};out;`)),
  );

  return { majorRoads, minorRoads, waterways, waterInfra, facilities, places };
}

/**
 * Grade regular de altitude. A API aceita 100 coordenadas por chamada; a
 * grade é dividida em lotes e cacheada inteira.
 */
export async function fetchElevationGrid(bbox, cols, rows) {
  return cached(`elevation-${cols}x${rows}.json`, async () => {
    const [west, south, east, north] = bbox;
    const points = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        points.push([
          west + ((east - west) * c) / (cols - 1),
          north - ((north - south) * r) / (rows - 1),
        ]);
      }
    }
    const values = [];
    for (let i = 0; i < points.length; i += 100) {
      const batch = points.slice(i, i + 100);
      const url =
        "https://api.open-meteo.com/v1/elevation?latitude=" +
        batch.map((p) => p[1].toFixed(5)).join(",") +
        "&longitude=" +
        batch.map((p) => p[0].toFixed(5)).join(",");
      let json;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
        if (response.ok) {
          json = await response.json();
          break;
        }
        // O plano gratuito conta cada coordenada como uma chamada: ao estourar a
        // cota por minuto, espera a janela virar.
        await sleep(response.status === 429 ? 61_000 : 2000 * (attempt + 1));
      }
      if (!json) throw new Error("Falha ao obter altitude da Open-Meteo");
      values.push(...json.elevation);
      process.stdout.write(`  altitude ${Math.min(i + 100, points.length)}/${points.length}\r`);
      await sleep(10_500);
    }
    return { bbox, cols, rows, values };
  });
}
