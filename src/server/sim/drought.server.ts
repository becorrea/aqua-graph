/**
 * Seca e resiliência do abastecimento.
 *
 * Em Ribeirão Preto a água vem de poços profundos do Aquífero Guarani. O
 * risco de falta d'água não depende de uma represa esvaziando, e sim da
 * margem entre o que os poços conseguem produzir e o que a cidade consome
 * (mais o que se perde em vazamentos). Em dias quentes o consumo sobe; com
 * poços em manutenção a produção cai; se a margem fica negativa por muitos
 * dias, os reservatórios deixam de se recuperar à noite e o nível médio
 * diário desce. Abaixo de 25% os bairros mais altos começam a ter falta.
 *
 * O balanço é diário, por sistema de reservação:
 *   margem      = (produção − consumo − perdas) / consumo
 *   equilíbrio  = 60% + 4 × margem (em p.p.)   — margem 0 sustenta ~60%
 *   nível(t+1)  = nível(t) + k · (equilíbrio − nível(t)),  k = 0,06/dia
 * O nível "lembra" as últimas semanas (constante de tempo ≈ 16 dias): um dia
 * quente isolado pouco muda; uma sequência de dias de déficit esvazia o
 * sistema. O consumo responde à temperatura máxima real (Open-Meteo) e à
 * chuva; a produção, à disponibilidade dos poços.
 */
import type {
  DroughtParams,
  DroughtPoint,
  DroughtResponse,
  DroughtScenario,
  DroughtSystem,
  Weather,
} from "@/types/api";
import type { Severity } from "@/types";
import { model, sectorsOfSystem } from "../geo/model.server";
import { clamp, formatDay, isoLocal, localAt, memo, round } from "./core.server";
import { params } from "./hydraulics.server";
import { getWeather, normalDailyRain, normalTmax, todayIndex } from "./weather.server";
import { eventsAt } from "./losses.server";

export const CRITICAL_LEVEL = 25;
const HISTORY_DAYS = 90;
const HORIZON_DAYS = 150;
const RELAXATION = 0.06;

/**
 * Força das medidas. Calibradas para que, sob estresse, nenhuma deixe o
 * Sistema Sul raspando o limiar de 25%: perto dele, um décimo de grau na
 * previsão decidia entre "40 dias" e "120 dias".
 */
const PRESSURE_STEP = 0.15;
const TRANSFER_CAP = 1600;
const CAMPAIGN_CUT = 0.02;

/** Situação operacional dos poços de cada sistema (simulada). */
const WELLS: Record<string, { availability: number; offline: number; startLevel: number }> = {
  norte: { availability: 1.004, offline: 0, startLevel: 68 },
  central: { availability: 0.99, offline: 1, startLevel: 64 },
  sul: { availability: 0.94, offline: 2, startLevel: 60 },
};

type ClimateDay = {
  day: number;
  time: number;
  tmax: number;
  rain: number;
  observed: boolean;
  /** Só nos dias de climatologia: chance de o dia ser chuvoso. */
  wetChance?: number;
};

/** Clima diário de −90 a +150 dias: observado e previsto (Open-Meteo) e, depois, climatologia. */
function climateSeries(weather: Weather, now: number): ClimateDay[] {
  const index = todayIndex(weather);
  const days: ClimateDay[] = [];
  for (let day = -HISTORY_DAYS; day <= HORIZON_DAYS; day += 1) {
    const time = localAt(now, day, 12);
    const source = weather.daily[index + day];
    if (source) {
      days.push({ day, time, tmax: source.tmax, rain: source.precipitation, observed: day < 0 });
      continue;
    }
    // Além da previsão, o valor esperado da climatologia — não um sorteio. Um
    // dia quente ou chuvoso inventado no dia 40 decidia sozinho se uma medida
    // "compra" 46 ou 137 dias; a média deixa a projeção estável.
    const normal = normalDailyRain(time);
    days.push({
      day,
      time,
      tmax: normalTmax(time),
      rain: normal,
      observed: false,
      wetChance: clamp(normal / 9 + 0.05, 0.05, 0.75),
    });
  }
  return days;
}

type SystemConstants = {
  id: string;
  name: string;
  sectors: string[];
  sectorNames: string[];
  demand0: number;
  losses0: number;
  capacity: number;
  production0: number;
  availability: number;
  offline: number;
  startLevel: number;
  reservoirs: string[];
};

function systemConstants(systemId: string, now: number): SystemConstants {
  const sectors = sectorsOfSystem(systemId);
  const events = eventsAt(now);
  let demand0 = 0;
  let losses0 = 0;
  for (const sector of sectors) {
    const p = params(sector.id);
    demand0 += p.demandAvg * 86.4;
    losses0 += p.leakRef * ((p.meanStatic * 0.9) / 30) ** 1.15 * 86.4;
    losses0 += events
      .filter((event) => event.sector === sector.id && event.kind === "leak")
      .reduce((sum, event) => sum + event.size * 86.4, 0);
  }
  const reservoirs = model.reservoirs.filter((reservoir) => reservoir.system === systemId);
  const wells = WELLS[systemId] ?? { availability: 1, offline: 0, startLevel: 72 };
  return {
    id: systemId,
    name: model.systems.find((system) => system.id === systemId)?.name ?? systemId,
    sectors: sectors.map((sector) => sector.id),
    sectorNames: sectors.map((sector) => sector.name),
    demand0,
    losses0,
    capacity: reservoirs.reduce((sum, reservoir) => sum + reservoir.capacity, 0),
    // Capacidade nominal dos poços: 3% acima do consumo + perdas médios.
    production0: (demand0 + losses0) * 1.03,
    availability: wells.availability,
    offline: wells.offline,
    startLevel: wells.startLevel,
    reservoirs: reservoirs.map((reservoir) => reservoir.id),
  };
}

type Measures = {
  pressureReduction: number;
  campaign: boolean;
  transferIn: number;
  tempDelta: number;
  rainFactor: number;
  extraOffline: number;
};

const NO_MEASURES: Measures = {
  pressureReduction: 0,
  campaign: false,
  transferIn: 0,
  tempDelta: 0,
  rainFactor: 1,
  extraOffline: 0,
};

type DayResult = {
  day: number;
  level: number;
  demand: number;
  production: number;
  losses: number;
  margin: number;
};

function simulate(
  c: SystemConstants,
  climate: ClimateDay[],
  measures: Measures,
  from: number,
  to: number,
  startLevel: number,
) {
  const out: DayResult[] = [];
  let level = startLevel;
  for (const d of climate) {
    if (d.day < from || d.day > to) continue;
    const future = d.day > 0;
    const m = future ? measures : NO_MEASURES;
    const tmax = d.tmax + m.tempDelta;
    const tempFactor = 1 + (tmax > 28 ? 0.018 : 0.006) * (tmax - 28);
    const rainFactor =
      d.wetChance === undefined
        ? d.rain * m.rainFactor >= 5
          ? 0.94
          : 1
        : 1 - 0.06 * heavyRainChance(d.rain, d.wetChance, m.rainFactor);
    const campaign = m.campaign ? 1 - CAMPAIGN_CUT * clamp(d.day / 10, 0, 1) : 1;
    const demand = c.demand0 * tempFactor * rainFactor * campaign;
    // FAVAD: a redução de pressão (plena à noite, modulada de dia nas VRPs)
    // reduz o vazamento de fundo, que cresce com P^1,15.
    const pressureEffect = 0.55 * (1 - (1 - m.pressureReduction) ** 1.15);
    const losses = c.losses0 * (1 - pressureEffect);
    const production = c.production0 * (c.availability - m.extraOffline * 0.018) + m.transferIn;
    const margin = (production - demand - losses) / demand;
    const equilibrium = clamp(60 + 400 * margin, 5, 95);
    level = clamp(level + RELAXATION * (equilibrium - level), 5, 97);
    out.push({ day: d.day, level, demand, production, losses, margin });
  }
  return out;
}

/**
 * Climatologia: chance de um dia ter chuva de 5 mm ou mais (já com o fator do
 * cenário), que é o que derruba o consumo. Num dia chuvoso a chuva é uniforme
 * entre 0,5 e 1,5 vez a média dos dias chuvosos.
 */
function heavyRainChance(normal: number, wetChance: number, factor: number) {
  if (normal <= 0 || factor <= 0) return 0;
  const wetDayMean = normal / wetChance;
  return wetChance * clamp(1.5 - 5 / factor / wetDayMean, 0, 1);
}

const firstCritical = (days: DayResult[]) =>
  days.find((d) => d.level < CRITICAL_LEVEL)?.day ?? null;

function severityFor(days: number | null, adverseDays: number | null, level: number): Severity {
  if (level < CRITICAL_LEVEL || (days !== null && days <= 30)) return "critical";
  if ((days !== null && days <= 60) || level < 30) return "high";
  if ((days !== null && days <= 110) || level < 40 || (adverseDays !== null && adverseDays <= 30))
    return "attention";
  return "normal";
}

/** Estresse climático: onda de calor (+1,8 °C), metade da chuva e mais um poço parado. */
const STRESS: Measures = { ...NO_MEASURES, tempDelta: 1.8, rainFactor: 0.5, extraOffline: 1 };

/**
 * Medidas operacionais avaliadas sob estresse — é assim que se testa
 * resiliência: quanto tempo cada medida compra se o clima piorar.
 */
function measuresFor(scenario: string, donorSurplus: number): Measures {
  const transferIn = Math.min(TRANSFER_CAP, Math.max(0, donorSurplus));
  switch (scenario) {
    case "pressao":
      return { ...STRESS, pressureReduction: PRESSURE_STEP };
    case "transferencia":
      return { ...STRESS, transferIn };
    case "campanha":
      return { ...STRESS, campaign: true };
    case "combinado":
      return { ...STRESS, pressureReduction: PRESSURE_STEP, campaign: true, transferIn };
    case "adverso":
    case "atual":
      return STRESS;
    default:
      return NO_MEASURES;
  }
}

/** Perfis climáticos do simulador. "normal" é a previsão real + climatologia. */
const RAIN_OUTLOOK: Record<
  DroughtParams["rain"],
  { rainFactor: number; tempDelta: number; extraOffline: number }
> = {
  normal: { rainFactor: 1, tempDelta: 0, extraOffline: 0 },
  abaixo: { rainFactor: 0.5, tempDelta: 1.4, extraOffline: 0 },
  critica: { rainFactor: 0.25, tempDelta: 2.2, extraOffline: 1 },
};

type Computed = {
  climate: ClimateDay[];
  systems: Array<{
    c: SystemConstants;
    history: DayResult[];
    base: DayResult[];
    adverse: DayResult[];
    today: number;
  }>;
};

const computedCache = memo<Computed>(10 * 60_000);

function compute(weather: Weather, now: number): Computed {
  const key = `${weather.fetchedAt}:${Math.floor(now / (30 * 60_000))}`;
  return computedCache(key, () => {
    const climate = climateSeries(weather, now);
    const systems = model.systems.map((system) => {
      const c = systemConstants(system.id, now);
      const history = simulate(c, climate, NO_MEASURES, -HISTORY_DAYS, 0, c.startLevel);
      const today = history[history.length - 1]?.level ?? c.startLevel;
      const base = simulate(c, climate, NO_MEASURES, 1, HORIZON_DAYS, today);
      const adverse = simulate(c, climate, STRESS, 1, HORIZON_DAYS, today);
      return { c, history, base, adverse, today };
    });
    return { climate, systems };
  });
}

export type DroughtQuery = {
  system: string | null;
  scenario: string | null;
  custom: DroughtParams | null;
};

export async function getDrought(query: DroughtQuery, now = Date.now()): Promise<DroughtResponse> {
  const weather = await getWeather();
  const { climate, systems } = compute(weather, now);

  const ranked = [...systems].sort(
    (a, b) =>
      (firstCritical(a.base) ?? 999) - (firstCritical(b.base) ?? 999) ||
      (firstCritical(a.adverse) ?? 999) - (firstCritical(b.adverse) ?? 999) ||
      a.today - b.today,
  );
  const worst = ranked[0] ?? systems[0];
  if (!worst) throw new Error("Sem sistemas de abastecimento no modelo");
  const focus = systems.find((s) => s.c.id === query.system) ?? worst;

  // Doador da transferência: o sistema com maior sobra de produção hoje.
  const donor = systems
    .filter((s) => s.c.id !== focus.c.id)
    .map((s) => {
      const last = s.history[s.history.length - 1];
      return { s, surplus: last ? last.production - last.demand - last.losses : 0 };
    })
    .sort((a, b) => b.surplus - a.surplus)[0];
  const donorSurplus = donor ? donor.surplus + donor.s.c.production0 * 0.02 : 0;

  const scenarioDays = (id: string) =>
    firstCritical(
      simulate(focus.c, climate, measuresFor(id, donorSurplus), 1, HORIZON_DAYS, focus.today),
    );
  const baseDays = firstCritical(focus.base);
  const stressDays = firstCritical(focus.adverse);
  // Ganho em dias sob estresse; "null" na criticidade significa além do horizonte.
  const gainOf = (days: number | null) =>
    stressDays === null ? null : (days ?? HORIZON_DAYS) - stressDays;

  const scenarioList: DroughtScenario[] = [
    {
      id: "atual",
      name: "Sem intervenção",
      detail: "Onda de calor, chuva 50% abaixo e mais um poço parado",
      daysToCritical: stressDays,
      gain: null,
    },
    {
      id: "pressao",
      name: "Gestão de pressão",
      detail: `−${Math.round(PRESSURE_STEP * 100)}% nas VRPs (plena entre 23h e 05h)`,
      daysToCritical: 0,
      gain: 0,
    },
    {
      id: "transferencia",
      name: "Transferência entre sistemas",
      detail: `Até ${Math.round(Math.min(TRANSFER_CAP, donorSurplus)).toLocaleString("pt-BR")} m³/dia via adutoras do ${donor?.s.c.name ?? "sistema vizinho"}`,
      daysToCritical: 0,
      gain: 0,
    },
    {
      id: "campanha",
      name: "Campanha direcionada de consumo",
      detail: `−${Math.round(CAMPAIGN_CUT * 100)}% no consumo em 10 dias (residencial e grandes consumidores)`,
      daysToCritical: 0,
      gain: 0,
    },
    {
      id: "combinado",
      name: "Plano combinado",
      detail: "Pressão + transferência + campanha",
      daysToCritical: 0,
      gain: 0,
    },
  ].map((scenario) => {
    if (scenario.id === "atual") return scenario;
    const days = scenarioDays(scenario.id);
    return { ...scenario, daysToCritical: days, gain: gainOf(days) };
  });

  const selectedScenario = query.custom
    ? "custom"
    : (scenarioList.find((s) => s.id === query.scenario)?.id ?? "atual");
  let scenarioRun: DayResult[] | null = null;
  let custom: DroughtResponse["custom"] = null;
  if (query.custom) {
    const outlook = RAIN_OUTLOOK[query.custom.rain];
    const full: Measures = {
      pressureReduction: clamp(query.custom.pressureReduction, 0, 20) / 100,
      campaign: query.custom.campaign,
      transferIn: query.custom.transfer ? Math.min(TRANSFER_CAP, Math.max(0, donorSurplus)) : 0,
      tempDelta: outlook.tempDelta,
      rainFactor: outlook.rainFactor,
      extraOffline: outlook.extraOffline,
    };
    scenarioRun = simulate(focus.c, climate, full, 1, HORIZON_DAYS, focus.today);
    const climateMeasures: Measures = {
      ...NO_MEASURES,
      tempDelta: outlook.tempDelta,
      rainFactor: outlook.rainFactor,
      extraOffline: outlook.extraOffline,
    };
    const climateOnly = simulate(focus.c, climate, climateMeasures, 1, HORIZON_DAYS, focus.today);
    const days = firstCritical(scenarioRun);
    const climateDays = firstCritical(climateOnly);
    // Contribuição de cada medida isolada sobre o clima escolhido.
    const isolated = (m: Partial<Measures>) => {
      const run = firstCritical(
        simulate(focus.c, climate, { ...climateMeasures, ...m }, 1, HORIZON_DAYS, focus.today),
      );
      return (run ?? HORIZON_DAYS) - (climateDays ?? HORIZON_DAYS);
    };
    custom = {
      daysToCritical: days,
      baseline: climateDays,
      gain: (days ?? HORIZON_DAYS) - (climateDays ?? HORIZON_DAYS),
      breakdown: [
        {
          label: "Redução de pressão",
          days:
            full.pressureReduction > 0
              ? isolated({ pressureReduction: full.pressureReduction })
              : 0,
        },
        {
          label: "Transferência entre sistemas",
          days: full.transferIn > 0 ? isolated({ transferIn: full.transferIn }) : 0,
        },
        { label: "Campanha de consumo", days: full.campaign ? isolated({ campaign: true }) : 0 },
        {
          label: "Clima escolhido vs. previsão real",
          days: (climateDays ?? HORIZON_DAYS) - (baseDays ?? HORIZON_DAYS),
        },
      ],
    };
  } else if (selectedScenario !== "atual") {
    scenarioRun = simulate(
      focus.c,
      climate,
      measuresFor(selectedScenario, donorSurplus),
      1,
      HORIZON_DAYS,
      focus.today,
    );
  }

  const series: DroughtPoint[] = [];
  for (const d of focus.history) {
    series.push({
      day: d.day,
      date: formatDay(localAt(now, d.day, 12)),
      observed: round(d.level, 1),
      base: d.day === 0 ? round(d.level, 1) : null,
      adverse: d.day === 0 ? round(d.level, 1) : null,
      scenario: d.day === 0 && scenarioRun ? round(d.level, 1) : null,
    });
  }
  focus.base.forEach((d, i) => {
    series.push({
      day: d.day,
      date: formatDay(localAt(now, d.day, 12)),
      observed: null,
      base: round(d.level, 1),
      adverse: round(focus.adverse[i]?.level ?? d.level, 1),
      scenario: scenarioRun ? round(scenarioRun[i]?.level ?? d.level, 1) : null,
    });
  });

  const daily = [...focus.history.slice(-45), ...focus.base.slice(0, 45)].map((d) => {
    const climateDay = climate.find((c) => c.day === d.day);
    return {
      day: d.day,
      date: formatDay(localAt(now, d.day, 12)),
      demand: Math.round(d.demand),
      production: Math.round(d.production),
      losses: Math.round(d.losses),
      tmax: round(climateDay?.tmax ?? 0, 1),
      rain: round(climateDay?.rain ?? 0, 1),
      observed: climateDay?.observed ?? false,
    };
  });

  const systemsOut: DroughtSystem[] = systems.map((s) => {
    const last = s.history[s.history.length - 1];
    const weekAgo = s.history[s.history.length - 8];
    const days = firstCritical(s.base);
    return {
      id: s.c.id,
      name: s.c.name,
      sectors: s.c.sectors,
      sectorNames: s.c.sectorNames,
      level: round(s.today, 1),
      trend7d: round(s.today - (weekAgo?.level ?? s.today), 1),
      severity: severityFor(days, firstCritical(s.adverse), s.today),
      daysToCritical: days,
      adverseDays: firstCritical(s.adverse),
      capacityM3: s.c.capacity,
      demandM3day: Math.round(last?.demand ?? s.c.demand0),
      productionM3day: Math.round(last?.production ?? s.c.production0),
      lossesM3day: Math.round(last?.losses ?? s.c.losses0),
      margin: round((last?.margin ?? 0) * 100, 1),
      wellsOffline: s.c.offline,
      reservoirs: s.c.reservoirs,
    };
  });

  const totalCapacity = systems.reduce((sum, s) => sum + s.c.capacity, 0);
  const past = climate.filter((d) => d.day < 0 && d.day >= -60);
  const week = climate.filter((d) => d.day < 0 && d.day >= -7);
  const next = climate.filter((d) => d.day >= 0 && d.day < 16);
  const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
  const criticalDays = systemsOut
    .map((s) => s.daysToCritical)
    .filter((d): d is number => d !== null);
  const adverseDays = systemsOut.map((s) => s.adverseDays).filter((d): d is number => d !== null);
  const todayRows = systems.map((s) => s.history[s.history.length - 1]);

  return {
    generatedAt: new Date(now).toISOString(),
    weatherSource: weather.source,
    focus: focus.c.id,
    climate: {
      rain60: round(
        past.reduce((sum, d) => sum + d.rain, 0),
        0,
      ),
      normal60: round(
        past.reduce((sum, d) => sum + normalDailyRain(d.time), 0),
        0,
      ),
      tmax7: round(avg(week.map((d) => d.tmax)), 1),
      normalTmax: round(normalTmax(now), 1),
      rainNext16: round(
        next.reduce((sum, d) => sum + d.rain, 0),
        0,
      ),
      tmaxNext16: round(avg(next.map((d) => d.tmax)), 1),
    },
    city: {
      level: round(
        systems.reduce((sum, s) => sum + s.today * s.c.capacity, 0) / (totalCapacity || 1),
        1,
      ),
      daysToCritical: criticalDays.length ? Math.min(...criticalDays) : null,
      criticalSystem: worst.c.name,
      adverseDays: adverseDays.length ? Math.min(...adverseDays) : null,
      demandLps: Math.round(todayRows.reduce((sum, d) => sum + (d?.demand ?? 0), 0) / 86.4),
      productionLps: Math.round(todayRows.reduce((sum, d) => sum + (d?.production ?? 0), 0) / 86.4),
    },
    systems: systemsOut,
    series,
    daily,
    scenarios: scenarioList,
    selectedScenario,
    custom,
    criticalLevel: CRITICAL_LEVEL,
    horizonDays: HORIZON_DAYS,
  };
}

/** Nível médio de hoje por sistema — usado pelos sensores de nível e pela visão geral. */
export async function systemLevels(now = Date.now()) {
  const weather = await getWeather();
  const { systems } = compute(weather, now);
  return new Map(
    systems.map((s) => [
      s.c.id,
      { level: s.today, daysToCritical: firstCritical(s.base), name: s.c.name },
    ]),
  );
}

export const droughtIsoDate = (now: number) => isoLocal(now).slice(0, 10);
