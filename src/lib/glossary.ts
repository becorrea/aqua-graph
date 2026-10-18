/**
 * Glossário e catálogo de sensores.
 *
 * Fonte única dos textos explicativos: os tooltips da interface (termos,
 * KPIs, sensores e elementos do mapa) leem daqui, então a explicação de um
 * conceito é sempre a mesma em qualquer tela.
 */
import type { SensorType } from "@/types/api";

export type GlossaryEntry = { term: string; definition: string };

export const glossary = {
  setor: {
    term: "Setor de abastecimento (DMA)",
    definition:
      "Área da rede com entrada de água medida e conhecida. Comparar o que entra com o que é consumido revela perdas setor a setor.",
  },
  perdaFisica: {
    term: "Perda física estimada",
    definition:
      "Parte da água que entra na rede e não chega ao consumidor: vazamentos visíveis e, principalmente, não visíveis. Calculada pelo balanço hídrico das últimas 24 h.",
  },
  balanco: {
    term: "Balanço hídrico",
    definition:
      "Vazão que entrou no setor (macromedidor) menos o consumo medido nos hidrômetros. A diferença é perda.",
  },
  mnf: {
    term: "Vazão mínima noturna (MNF)",
    definition:
      "Menor vazão de entrada entre 02h e 04h, quando quase ninguém usa água. Se ela sobe de uma noite para outra sem explicação, é sinal de vazamento novo.",
  },
  favad: {
    term: "Modelo FAVAD",
    definition:
      "Relação usada no setor de saneamento: a vazão de um vazamento cresce com a pressão (L ∝ P^1,15). Por isso reduzir a pressão reduz perdas.",
  },
  mca: {
    term: "mca (metro de coluna d'água)",
    definition:
      "Unidade de pressão da rede. 10 mca ≈ 1 bar. Redes urbanas operam tipicamente entre 10 e 50 mca.",
  },
  vrp: {
    term: "VRP (válvula redutora de pressão)",
    definition:
      "Equipamento que limita a pressão na entrada de uma zona. É por ela que se faz a gestão de pressão noturna.",
  },
  probabilidade: {
    term: "Probabilidade de vazamento",
    definition:
      "Combinação calibrada de quatro evidências (vazão noturna, pressão, balanço e consumo) mais o histórico da rede. Nunca passa de 92%: o modelo indica onde olhar, a confirmação é em campo.",
  },
  candidato: {
    term: "Trecho provável",
    definition:
      "Tubo que melhor explica o padrão de queda de pressão nos sensores, ponderado por idade e material. A participação (%) indica onde a equipe deve começar a inspeção com geofone.",
  },
  reservacao: {
    term: "Reservação média",
    definition:
      "Nível médio diário dos reservatórios do sistema. Abaixo de 25% os bairros mais altos começam a ter falta d'água nos horários de pico.",
  },
  margem: {
    term: "Margem de produção",
    definition:
      "(Produção dos poços − consumo − perdas) ÷ consumo. Negativa por vários dias seguidos, esvazia os reservatórios.",
  },
  aquifero: {
    term: "Aquífero Guarani",
    definition:
      "Ribeirão Preto é abastecida por poços profundos neste aquífero. O nível dele responde em anos, não semanas — a crise de curto prazo vem do calor (consumo) e de poços parados.",
  },
  estresse: {
    term: "Teste de estresse",
    definition:
      "Cenário adverso usado para avaliar medidas: onda de calor (+1,8 °C), metade da chuva prevista e mais um poço fora de operação.",
  },
  racional: {
    term: "Método racional",
    definition:
      "Q = C · i · A / 3,6. Vazão de pico (m³/s) a partir do coeficiente de escoamento C, da intensidade da chuva i (mm/h) e da área da bacia A (km²).",
  },
  tc: {
    term: "Tempo de concentração",
    definition:
      "Tempo que a água leva do ponto mais distante da bacia até o ponto crítico. Calculado pela fórmula de Kirpich com o comprimento e a declividade reais do terreno.",
  },
  capacidade: {
    term: "Capacidade da galeria",
    definition:
      "Vazão que a drenagem suporta sem transbordar. Acima de 125% dela a lâmina d'água na via passa de ~30 cm: nível crítico.",
  },
  suscetibilidade: {
    term: "Suscetibilidade (relevo)",
    definition:
      "Combina altura acima do córrego mais próximo, distância até ele e posição na bacia. Calculada a partir do relevo real (Copernicus GLO-90).",
  },
  cobertura: {
    term: "Cobertura informacional",
    definition:
      "Fração da rede (ponderada pela importância de cada trecho) em que a incerteza do modelo é menor que 50%: ali o modelo enxerga mais do que adivinha.",
  },
  incerteza: {
    term: "Incerteza do modelo",
    definition:
      "Variância média do estado hidráulico estimado, de 0% (medido) a 100% (sem nenhuma informação). Cai perto de cada sensor.",
  },
  gp: {
    term: "Processo gaussiano",
    definition:
      "Modelo estatístico que estima o estado da rede entre sensores e diz quanto confia em cada estimativa. Permite calcular quanto um sensor novo reduziria a incerteza antes de instalá-lo.",
  },
  ganho: {
    term: "Ganho de informação",
    definition:
      "Redução da incerteza somada da rede ao adicionar um sensor. Cada sensor novo rende um pouco menos que o anterior (retornos decrescentes).",
  },
  deteccao: {
    term: "Capacidade de detecção",
    definition:
      "Chance média de um vazamento ser percebido pela telemetria, considerando onde estão os sensores.",
  },
  confianca: {
    term: "Confiança",
    definition:
      "Quão sólida é a evidência por trás da recomendação. Estimativas de modelo — devem ser validadas em campo.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof glossary;

export type SensorKind = {
  type: SensorType;
  name: string;
  short: string;
  unit: string;
  interval: string;
  measures: string;
  purpose: string;
  module: string;
};

/** O que cada tipo de sensor mede e para que serve no AquaGraph. */
export const sensorKinds: Record<SensorType, SensorKind> = {
  flow: {
    type: "flow",
    name: "Macromedidor de vazão",
    short: "Vazão",
    unit: "L/s",
    interval: "a cada 5 min",
    measures: "Litros por segundo que entram no setor pela adutora.",
    purpose: "Balanço hídrico e vazão mínima noturna — a base da detecção de vazamentos.",
    module: "Perdas e Vazamentos",
  },
  pressure: {
    type: "pressure",
    name: "Sensor de pressão",
    short: "Pressão",
    unit: "mca",
    interval: "a cada 5 min",
    measures:
      "Pressão da água na rede, no ponto mais alto (crítico) do setor e em pontos intermediários.",
    purpose: "Queda de pressão fora do esperado aponta vazamento e ajuda a localizar o trecho.",
    module: "Perdas e Vazamentos",
  },
  level: {
    type: "level",
    name: "Sensor de nível de reservatório",
    short: "Nível",
    unit: "%",
    interval: "a cada 1 min",
    measures: "Altura da água no reservatório, em % da capacidade.",
    purpose: "Mostra se a produção acompanha o consumo — o termômetro da seca.",
    module: "Seca e Resiliência",
  },
  rain: {
    type: "rain",
    name: "Pluviômetro",
    short: "Chuva",
    unit: "mm/h",
    interval: "a cada 1 min",
    measures: "Intensidade da chuva no local.",
    purpose: "Confirma a previsão e alimenta o modelo de escoamento urbano.",
    module: "Enchentes e Resposta",
  },
  river: {
    type: "river",
    name: "Régua de nível do córrego",
    short: "Córrego",
    unit: "m",
    interval: "a cada 2 min",
    measures: "Altura da lâmina d'água no córrego, a montante de um ponto crítico.",
    purpose: "Antecipa o transbordamento comparando com as cotas de alerta e de inundação.",
    module: "Enchentes e Resposta",
  },
};

export const PIPE_CLASS_LABEL = {
  trunk: { name: "Adutora", detail: "Leva água do centro de reservação até a entrada do setor." },
  main: {
    name: "Rede principal",
    detail: "Tubulação de maior diâmetro sob as avenidas; distribui para os bairros.",
  },
  sec: {
    name: "Rede secundária",
    detail: "Tubulação das ruas, de onde saem as ligações dos imóveis.",
  },
} as const;
