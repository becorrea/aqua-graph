/**
 * Configuração do recorte geográfico usado pelo AquaGraph.
 *
 * Tudo o que é geografia real (vias, córregos, reservatórios, hospitais,
 * bairros e relevo) sai deste recorte. Para levar a demonstração a outra
 * cidade, troque o recorte, os bairros-semente dos setores e rode
 * `node scripts/build-geodata.mjs` novamente.
 */
export const CITY = {
  name: "Ribeirão Preto",
  state: "SP",
  /** Centro de referência (Praça XV / Centro) — [lon, lat]. */
  center: [-47.8101, -21.1776],
  /** Recorte de estudo [oeste, sul, leste, norte] — região central urbana. */
  bbox: [-47.846, -21.221, -47.754, -21.139],
  timezone: "America/Sao_Paulo",
};

/**
 * Setores de abastecimento (DMAs). Cada setor nasce de um bairro real e a
 * divisa entre setores é a célula de Voronoi entre os bairros-semente.
 * `system` agrupa os setores nos três sistemas de reservação da seca.
 */
export const SECTORS = [
  { id: "12-A", seed: "Ipiranga", system: "norte" },
  { id: "05-E", seed: "Jardim Iara", system: "norte" },
  { id: "33-G", seed: "Vila Tibério", system: "norte" },
  { id: "08-C", seed: "Centro", system: "central" },
  { id: "14-B", seed: "Jardim Paulista", system: "central" },
  { id: "41-H", seed: "Lagoinha", system: "central" },
  { id: "29-F", seed: "Jardim Califórnia", system: "sul" },
  { id: "21-D", seed: "Jardim Irajá", system: "sul" },
  { id: "17-C", seed: "Ribeirânia", system: "sul" },
];

export const SYSTEMS = [
  { id: "norte", name: "Sistema Norte" },
  { id: "central", name: "Sistema Central" },
  { id: "sul", name: "Sistema Sul" },
];

/** Setor onde o cenário de vazamento acontece (recebe rede secundária detalhada). */
export const LEAK_SECTOR = "14-B";

/** Espelhos públicos do Overpass, tentados em ordem. */
export const OVERPASS_ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
