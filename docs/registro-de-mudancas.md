# Registro de mudanças do AquaGraph

Atualizado em 17/10/2026.

Tudo o que foi criado, alterado e removido no AquaGraph nesta rodada de trabalho: o protótipo virou um painel com mapa real de Ribeirão Preto, back-end de simulação e seis abas reorganizadas. O guia de uso está em [Guia do AquaGraph](guia-aquagraph.md).

## Resumo

O código está no commit `967960d` (“Turn AquaGraph into an operational demo with real map and simulation backend”), na branch `feat/aquagraph-real`, criada a partir da `main` (`b2a313f`). Este registro e o guia foram adicionados em `docs/` num commit seguinte, na mesma branch. A `main` não foi tocada.

| Medida                 | Valor                                          |
| ---------------------- | ---------------------------------------------- |
| Arquivos no commit     | 80                                             |
| Criados                | 41                                             |
| Alterados              | 20                                             |
| Removidos              | 19                                             |
| Linhas adicionadas     | 26.259 (11.456 são o modelo geográfico gerado) |
| Linhas removidas       | 6.621                                          |
| Páginas antes → depois | 11 → 6                                         |

Ficaram de fora do commit, de propósito: a pasta `.claude/` (arquivo interno do Claude Code), o cache de download dos geodados (`scripts/.geodata-cache/`, agora no `.gitignore`) e a pasta de build `.output/`.

## Etapas do trabalho

O trabalho seguiu os pedidos na ordem em que vieram; cada etapa abaixo diz o que foi entregue.

1. **Trazer o repositório.** Clone de `becorrea/aqua-graph`.
2. **Rodar o projeto.** `npm install` e servidor de desenvolvimento em http://localhost:8080.
3. **Back-end real.** Rotas de API no próprio TanStack Start (`src/routes/api`) chamando um motor de simulação no servidor (`src/server/sim`). Os dados falsos fixos de `src/data` saíram.
4. **Mapa real no tema azul.** MapLibre com o OpenStreetMap vetorial do OpenFreeMap, recolorido com as cores do design system. Rede, setores, reservatórios, córregos e equipamentos foram gerados das ruas e do relevo reais por um script de geodados.
5. **Simular o que não dá para ter de verdade.** 33 sensores, hidráulica, detecção de vazamento, reservação, hidrologia e processo gaussiano, todos determinísticos e ligados ao relógio e ao clima real.
6. **Enxugar e reestruturar.** De 11 para 6 páginas; Visão Geral deixou de repetir Perdas e virou o resumo que encaminha para cada módulo.
7. **Contar uma história.** Cada aba tem gráfico ou mapa no topo e depois as seções 01 Dados coletados, 02 Riscos detectados e 03 Ação recomendada.
8. **Explicar ao passar o mouse.** Glossário único (`src/lib/glossary.ts`) alimentando os ícones ⓘ, os termos sublinhados, os cartões de sensor e as dicas do mapa, com selo de origem real ou simulado.
9. **Revisão de front.** Capturas em 1280, 1440 e 1920 px procurando sobreposições; correções na seção de revisão de front.
10. **Code review de performance.** Revisão extensa, plano de melhorias e execução; detalhes na seção de performance.
11. **Guia de funcionalidades.** [Guia do AquaGraph](guia-aquagraph.md), com as funcionalidades em ordem e o que é cada dado.
12. **Correções finais de simulação.** Três problemas achados ao escrever o guia (perda por setor, Seca instável, trecho provável) foram corrigidos.
13. **GitHub.** Commit enviado para a branch `feat/aquagraph-real`, depois de refazer o login (a credencial salva tinha expirado).

## Arquivos criados

São 41 arquivos novos, em quatro grupos: motor de simulação no servidor, API, mapa e geodados, e interface.

**Motor de simulação (`src/server`)**

| Arquivo                           | O que faz                                                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/sim/core.server.ts`       | Relógio local de Ribeirão Preto, curva horária de consumo, ruído determinístico dos sensores, caches e formatação pt-BR                      |
| `server/sim/hydraulics.server.ts` | Parâmetros por setor, eventos roteirizados (vazamentos 14-B, 08-C, 21-D; consumo alto no 33-G), pressão, vazão e consumo medidos e esperados |
| `server/sim/losses.server.ts`     | Detecção de vazamento (vazão noturna, pressão, balanço, consumo, histórico), localização do trecho, KPIs de perdas e o replay hora a hora    |
| `server/sim/drought.server.ts`    | Reservação dos três sistemas: histórico de 90 dias, projeção de 150, teste de estresse, medidas e simulador                                  |
| `server/sim/flood.server.ts`      | Previsão real ou tempestade de 74 mm em 3 h, método racional por ponto crítico, quadros da animação, réguas e campos de risco                |
| `server/sim/sensing.server.ts`    | Processo gaussiano sobre 1.808 pontos da rede, cobertura, incerteza e plano guloso de novos sensores                                         |
| `server/sim/decisions.server.ts`  | Fila de recomendações dos quatro módulos e ordens de serviço guardadas no cookie `ag_ops`                                                    |
| `server/sim/snapshot.server.ts`   | Retrato ao vivo da cidade: sensores, setores, manchetes, linha do tempo e notificações                                                       |
| `server/sim/weather.server.ts`    | Clima do Open-Meteo com cache de 15 min, reaproveitamento por até 6 h e climatologia como reserva                                            |
| `server/geo/model.server.ts`      | Carrega e tipa o modelo geográfico; busca de setor por ponto e conversão de coordenadas                                                      |
| `server/geo/rp-model.json`        | Modelo geográfico gerado (setores, tubos, sensores, reservatórios, pontos críticos, grade de relevo)                                         |
| `server/http.server.ts`           | Respostas JSON com cache e tratamento de erro comum às rotas                                                                                 |

**API (`src/routes/api`)**: `live.ts`, `losses.ts`, `losses-replay.ts`, `drought.ts`, `flood.ts`, `sensing.ts`, `decisions.ts` (GET e POST) e `weather.ts`, uma rota por endpoint.

**Mapa e geodados**

| Arquivo                         | O que faz                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `components/map/OpsMap.tsx`     | Componente do mapa: camadas, busca, controles, legenda, escala, marcadores e reenquadramento                 |
| `components/map/MapTooltip.tsx` | Explicação de cada elemento ao passar o mouse, com selo de origem                                            |
| `components/map/basemap.ts`     | Estilo do OpenStreetMap recolorido no tema azul do design system                                             |
| `components/map/layers.ts`      | Camadas do AquaGraph (setores, rede, sensores, córregos, calor) e montagem do GeoJSON                        |
| `components/map/fields.ts`      | Rampas de cor e conversão das grades de risco e incerteza em imagem                                          |
| `scripts/build-geodata.mjs`     | Gera setores, rede sob as ruas, adutoras, pontos críticos, sensores e candidatos a partir do OSM e do relevo |
| `scripts/geodata/config.mjs`    | Cidade, recorte, setores e espelhos do Overpass                                                              |
| `scripts/geodata/fetch.mjs`     | Download com cache, espelhos e retentativas (Overpass e elevação)                                            |
| `scripts/geodata/geometry.mjs`  | Projeção, recorte de polígonos, simplificação e gerador aleatório com semente                                |
| `public/geo/rp-base.json`       | Mapa-base do navegador: setores, rede principal, reservatórios, córregos, equipamentos (328 KB)              |
| `public/geo/rp-secondary.json`  | Rede secundária, carregada sob demanda no zoom (1,1 MB)                                                      |

**Interface**

| Arquivo                                     | O que faz                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `lib/api.ts`                                | Hooks de dados (React Query) para cada endpoint e proteção contra divergência na hidratação |
| `lib/glossary.ts`                           | Fonte única dos textos explicativos e do catálogo de sensores                               |
| `lib/format.ts`                             | Números e tempos no padrão brasileiro                                                       |
| `components/aquagraph/ScenarioContext.tsx`  | Cenário da sessão (tempestade simulada, sensores instalados), compartilhado entre as abas   |
| `components/aquagraph/story.tsx`            | Esteira do dado à ação, cartões de desafio, seções numeradas e linha do tempo               |
| `components/aquagraph/sensors.tsx`          | Cartões de sensor, grade e inventário agrupado por tipo                                     |
| `styles/story.css`, `styles/components.css` | Estilos das seções, listas, cartões e tabelas novas, usando os tokens existentes            |
| `types/api.ts`, `types/geo.ts`              | Contratos de dados entre servidor e interface                                               |

## Arquivos alterados

São 20 arquivos alterados. O design system (`src/components/ui`, tokens e tipografia) não mudou; os estilos novos usam os tokens existentes.

| Arquivo                               | O que mudou                                                                                                              | Linhas (+/−) |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `routes/perdas.tsx`                   | Mapa real, ranking de setores, seções 01–03, evidências, trechos prováveis, replay, simulador de vazamento e OS pela API | +826 / −376  |
| `routes/enchentes.tsx`                | Previsão real × tempestade simulada, animação, três vistas do mapa, réguas, tabela de pontos críticos                    | +692 / −227  |
| `routes/seca.tsx`                     | Abas por sistema, gráfico de 240 dias, teste de estresse, produção × consumo, clima real, simulador                      | +642 / −254  |
| `routes/active-sensing.tsx`           | Campos de incerteza e cobertura no mapa, instalação simulada, pontos cegos, plano e inventário                           | +597 / −237  |
| `routes/index.tsx`                    | Visão Geral como resumo: esteira do dado à ação, mapa, desafios, próximas decisões e linha do tempo                      | +197 / −168  |
| `routes/decisoes.tsx`                 | Fila vinda da API, botão Executar gerando OS, painel de ordens de serviço                                                | +172 / −115  |
| `components/aquagraph/AppShell.tsx`   | Relógio real, clima real, chip de simulação ativa, notificações, fontes no rodapé                                        | +146 / −82   |
| `components/aquagraph/primitives.tsx` | Ícone ⓘ, termos com explicação, selos de origem, faixa da história, títulos de seção, KPIs com explicação                | +194 / −15   |
| `components/aquagraph/DemoMode.tsx`   | Cinco etapas novas, frases novas e volta ao cenário real ao iniciar e encerrar                                           | +13 / −7     |
| `components/aquagraph/charts.tsx`     | Eixo Y com números no padrão brasileiro                                                                                  | +6 / 0       |
| `data/navigation.ts`                  | Menu com 6 páginas e subtítulos curtos                                                                                   | +45 / −57    |
| `lib/severity.ts`                     | Faixas de severidade iguais às do motor de detecção (80 / 60 / 35%)                                                      | +3 / −3      |
| `styles/map.css`                      | Estilos do mapa novo: dicas, pinos, etiquetas, painéis e controles                                                       | +254 / −403  |
| `styles/shell.css`                    | Ajustes de KPI e do rodapé do menu                                                                                       | +8 / −3      |
| `styles.css`                          | Importa `story.css` e `components.css`                                                                                   | +2 / 0       |
| `routeTree.gen.ts`                    | Gerado pelo roteador: rotas novas da API, páginas removidas                                                              | +168 / −105  |
| `routes/README.md`                    | Só formatação (alinhamento da tabela pelo Prettier)                                                                      | +10 / −10    |
| `package.json`                        | Dependências `maplibre-gl` e `d3-delaunay` e script `geodata`                                                            | +3 / 0       |
| `package-lock.json`                   | Travas das dependências novas                                                                                            | +270 / −59   |
| `.gitignore`                          | Ignora `scripts/.geodata-cache/`                                                                                         | +1 / 0       |

## Arquivos removidos

Os 19 arquivos removidos eram páginas cortadas no enxugamento ou dados fixos substituídos pela simulação no servidor.

| Arquivos                                                                                            | Por que saíram                                                                                                         |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `routes/consumo.tsx`, `infraestrutura.tsx`, `manutencao.tsx`, `relatorios.tsx`, `configuracoes.tsx` | Páginas cortadas para a demonstração ficar em 6 abas; o que importava delas foi para Perdas, Seca e Centro de Decisões |
| `data/city.ts`, `cityGeometry.ts`, `waterNetwork.ts`, `reservoirs.ts`, `sensors.ts`                 | Cidade e rede desenhadas à mão, trocadas pelo mapa real e pelo modelo geográfico gerado                                |
| `data/leaks.ts`, `droughtScenarios.ts`, `floodEvents.ts`, `operations.ts`, `recommendations.ts`     | Números fixos, trocados pelo motor de simulação e pela API                                                             |
| `components/aquagraph/CityMap.tsx`, `DetailDrawer.tsx`                                              | Mapa SVG antigo e sua gaveta de detalhe, trocados por `OpsMap` e pelas dicas do mapa                                   |
| `hooks/useSimulatedClock.ts`, `useAnimatedNumber.ts`                                                | Relógio falso e animação de números, sem uso depois que os dados passaram a vir da API                                 |

## Revisão de front

A revisão de front tirou capturas de todas as páginas em 1280×800, 1440×900 e 1920×1080 e corrigiu tudo o que se sobrepunha ou quebrava.

| Problema                                                                       | Correção                                                                                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Etiquetas dos marcadores cobriam as abas do mapa em Enchentes                  | As abas Risco / Relevo / Drenagem foram para o cabeçalho do painel                                        |
| Etiquetas de marcadores próximos se sobrepunham                                | Etiqueta vira para a esquerda quando colide; só alertas, recomendações e sensores instalados têm etiqueta |
| Nomes de setores e de bairros disputavam espaço                                | Espaçamento e prioridade nos nomes dos setores; nomes de bairro do mapa-base mais apagados                |
| Mapa do Active Sensing esticava a página                                       | O “por que este local?” desceu para a seção 02                                                            |
| Tabela do Centro de Decisões estourava a largura                               | Coluna Módulo removida; o módulo virou etiqueta na justificativa; larguras fixas nas colunas numéricas    |
| Números quebrando linha em telas menores                                       | Regras para 1440 e 1320 px e números sem quebra                                                           |
| Rótulo e valor dos KPIs encavalados                                            | Rótulo em bloco próprio e valor que pode quebrar                                                          |
| Manchete apontava o sensor errado como próximo                                 | Passou a ler o próximo item do plano conforme os sensores já instalados                                   |
| Cartões de sistema da Seca eram botão dentro de botão (HTML inválido)          | Viraram `div` com papel de botão                                                                          |
| Página carregada direto mostrava dados diferentes antes e depois da hidratação | Dados só aparecem depois de hidratar, sem divergência                                                     |
| Mapa não se reenquadrava ao redimensionar a janela                             | Reenquadra até a pessoa mover o mapa                                                                      |
| Campos de incerteza e cobertura escondiam o mapa                               | Transparência maior nas rampas de cor                                                                     |

## Code review de performance

O maior ganho foi no servidor: o Active Sensing caiu de cerca de 3,9 s para 0,35 s na primeira chamada. Os tempos abaixo foram medidos empacotando o motor e rodando no Node, fora do navegador.

| Medida                           | Antes   | Depois                                                                         |
| -------------------------------- | ------- | ------------------------------------------------------------------------------ |
| Active Sensing, primeira chamada | ~3,9 s  | 0,35 s                                                                         |
| Perdas, primeira chamada         | ~310 ms | ~100 ms                                                                        |
| Perdas, troca de setor           | ~230 ms | 3–5 ms (~30 ms medidos pela API local depois da correção final da localização) |
| MapLibre no bundle do servidor   | ~1,4 MB | fora                                                                           |

**Servidor**

- Processo gaussiano reescrito com vetores tipados, Cholesky em memória contínua, vizinhanças do kernel pré-calculadas e plano em cache; pontos da rede agregados em células de 200 m (1.808 pontos).
- Perdas da cidade calculadas uma vez por minuto e reaproveitadas por qualquer setor clicado; o tempo até a detecção só é recalculado quando muda o início do evento.
- Ruído dos sensores com hash rápido e sementes em cache; hora local calculada uma vez por minuto.
- Clima com tempo limite de 6 s, uma nova tentativa, reaproveitamento do último valor por até 6 h e espera de 2 min antes de tentar de novo após falha.
- Ordens de serviço num cookie, para funcionar entre instâncias do Cloudflare Workers.

**Interface**

- MapLibre carregado só no navegador.
- Campos de cor redesenhados só quando os dados daquele campo mudam, com tabela de cores pré-calculada.
- Dica do mapa e escala só atualizam quando o alvo ou o valor muda, não a cada pixel.
- Marcadores visíveis, foco do mapa e dados dos gráficos da Seca e de Enchentes memorizados.
- Consultas esperam o cenário salvo ser restaurado, evitando buscar tudo duas vezes.
- Replay de Perdas sem efeitos colaterais dentro do `setState`; Enchentes mantém os dados na tela ao trocar de modo.
- Cache dos geodados separado por recorte da cidade.

## Correções finais de simulação

Três problemas apareceram ao conferir os números para o guia; os três foram corrigidos antes do commit.

| Problema                                                                           | Causa                                                                                                                   | Correção                                                                                                                                            | Resultado                                                                                        |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Perda física de ~55% em todo setor de madrugada, contra 32% na cidade              | O setor usava a razão instantânea; a cidade, o balanço de 24 h                                                          | Setor passou a usar o balanço das últimas 24 h, como a cidade e o glossário                                                                         | Setores entre 30% e 36%                                                                          |
| “Gestão de pressão” pulava de 137 para 44 dias com 0,1 °C de diferença na previsão | Além de 16 dias a climatologia era sorteada dia a dia, e as medidas deixavam o Sistema Sul raspando os 25%              | Climatologia pelo valor esperado; medidas recalibradas: pressão −15% (era −12%), transferência até 1.600 m³/dia (era 1.200), campanha −2% (era −3%) | Sem intervenção 21 dias, campanha 27, demais acima de 150, estável ao longo de 10 dias simulados |
| Durante o dia o trecho provável virava um tubo a ~780 m do vazamento               | Um só sensor perto do vazamento: o modelo acerta a distância, não a direção, e 6 h de dados deixavam o ruído desempatar | Média de 24 h a cada 5 min e ajuste mais estreito (σ de 0,09 para 0,045 mca)                                                                        | Topo sempre 14B-748 (o trecho real) ou 14B-745, a 50 m dele                                      |

Os textos do simulador da Seca acompanham os novos valores, e o valor inicial de redução de pressão no simulador passou de 12% para 15%.

## Dependências, scripts e verificações

Entraram duas dependências e um script; o resto do projeto continua com as mesmas ferramentas.

- `maplibre-gl` 5.24: o mapa, carregado só no navegador.
- `d3-delaunay` 6.0 (só desenvolvimento): recorte dos setores no script de geodados.
- `npm run geodata`: regenera os geodados a partir do OpenStreetMap e do relevo.

| Verificação                         | Resultado                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript (`tsc --noEmit`)         | Sem erros                                                                                                                             |
| ESLint nos arquivos do projeto      | Sem erros; 7 avisos: 6 de Fast Refresh (arquivos que exportam componente e função juntos) e 1 de dependência num efeito do MapTooltip |
| ESLint em `src/components/ui`       | 4.362 erros de quebra de linha CRLF, efeito do checkout no Windows; o Git normaliza no commit                                         |
| Build de produção (`npm run build`) | Concluído sem erros; MapLibre fora do bundle do servidor                                                                              |
| Replay de Perdas no navegador       | Avança quadro a quadro, avisa uma vez no fim e libera o botão                                                                         |
| Tempestade em Enchentes             | Anima de 0 a 74 mm                                                                                                                    |
| Modo Demo completo                  | Cinco etapas, tela final e volta ao cenário real (testado antes das três correções finais)                                            |
| Capturas em 1280, 1440 e 1920 px    | Sem sobreposições depois da revisão de front                                                                                          |

## Pendências

A branch está no GitHub; falta decidir quando ela entra na `main`, que é o que sincroniza com o Lovable.

- [ ] Abrir o pull request: [comparar main com feat/aquagraph-real](https://github.com/becorrea/aqua-graph/compare/main...feat/aquagraph-real).
- [ ] Atualizar o `bun.lock` com `bun install` antes de mesclar; só o `package-lock.json` foi atualizado.
- [ ] Rodar o Modo Demo de novo depois das correções finais de simulação.
- O `vite preview` não funciona com o build para Cloudflare; isso já era assim antes destas mudanças.
- No Windows, o lint de `src/components/ui` acusa quebras de linha CRLF; não afeta o repositório.
