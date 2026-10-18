# AquaGraph Hub

> **Documentação da versão atual:** [Guia do AquaGraph](docs/guia-aquagraph.md) (funcionalidades de cada aba e o que é cada dado) e [Registro de mudanças](docs/registro-de-mudancas.md) (tudo o que foi criado, alterado e removido). O texto abaixo é o briefing original do protótipo.

Quero que você desenvolva um PROTÓTIPO WEB NAVEGÁVEL DE ALTA FIDELIDADE chamado AQUAGRAPH.

IMPORTANTE:

Este não é um dashboard SaaS genérico.

Este não é um sistema administrativo tradicional.

Este não é um MVP visual simples.

É um produto demonstrativo para um desafio de inovação tecnológica da SONDA, relacionado à gestão hídrica urbana.

O protótipo precisa parecer um produto B2B/B2G real, premium e maduro, utilizado em um centro de operações de uma companhia de saneamento, prefeitura, concessionária ou smart city.

A principal referência visual são os mockups AquaGraph fornecidos junto deste prompt.

SEGUIR AS REFERÊNCIAS VISUAIS O MAIS FIELMENTE POSSÍVEL.

Não simplifique a interface.

Não transforme os mapas em cards genéricos.

Não substitua visualizações importantes por texto.

Não use estética "template do Lovable".

Não use excesso de gradientes roxos.

Não use interface clara/branca.

Não use elementos infantis ou gamificados.

Não use visual excessivamente futurista/cyberpunk.

A estética deve ser:

executiva,

tecnológica,

operacional,

sofisticada,

confiável,

urbana,

orientada a dados.

==================================================

1. CONCEITO DO PRODUTO

==================================================

Nome:

AquaGraph

Tagline:

Sistema Nervoso Digital da Água Urbana

Descrição:

O AquaGraph é uma plataforma de inteligência operacional hídrica que integra dados de abastecimento, reservatórios, sensores, clima, drenagem urbana, infraestrutura e históricos operacionais.

A solução cria uma visão digital viva da cidade para:

- detectar perdas e vazamentos;

- antecipar situações de escassez;

- identificar risco de enchentes;

- simular cenários;

- recomendar ações operacionais;

- indicar onde novos sensores deveriam ser instalados.

A principal ideia não é apenas "mostrar dados".

AquaGraph deve responder:

"O que está acontecendo?"

"Por que está acontecendo?"

"O que provavelmente acontecerá?"

"O que devemos fazer agora?"

==================================================

2. OBJETIVO DESTA VERSÃO

==================================================

Construir um PROTÓTIPO DEMONSTRATIVO.

Não é necessário backend real nesta primeira versão.

Utilize dados mockados realistas.

Entretanto, toda a interface deve parecer conectada a dados reais.

A aplicação deve ser navegável e permitir realizar uma demonstração de aproximadamente 3 a 5 minutos.

O protótipo precisa causar a impressão de que o produto já existe.

==================================================

3. STACK

==================================================

Utilizar:

React

TypeScript

Tailwind CSS

Lucide Icons

Recharts para gráficos

Framer Motion para animações discretas

Se precisar de gerenciamento de estado:

Zustand ou Context API.

Não implementar backend neste momento.

Criar os mocks em arquivos separados para facilitar futura substituição por APIs reais.

Estrutura sugerida:

/src

  /components

  /pages

  /data

  /hooks

  /types

  /lib

Criar componentes reutilizáveis.

==================================================

4. DESIGN SYSTEM

==================================================

O design deve reproduzir o padrão visual dos mockups fornecidos.

PALETA:

Background principal:

#07111F

#081827

#0B1E2E

Superfícies:

#0D2233

#10293C

#132F43

Borders:

rgba(94, 234, 212, 0.10)

rgba(125, 211, 252, 0.15)

Primary cyan:

#22D3EE

Secondary blue:

#38BDF8

Teal:

#14B8A6

Success:

#22C55E

Warning:

#F59E0B

Critical:

#EF4444

Texto principal:

#F8FAFC

Texto secundário:

#94A3B8

Texto terciário:

#64748B

Não utilizar preto puro.

==================================================

5. TIPOGRAFIA

==================================================

Utilizar fonte moderna e extremamente legível.

Preferência:

Inter

ou

Manrope

Hierarchy:

Page title:

28–32px

font-weight 600/700

Section title:

18–20px

KPI:

28–34px

Body:

13–14px

Labels:

11–12px

Evitar textos gigantes.

É um sistema operacional real, não landing page.

==================================================

6. LAYOUT GLOBAL

==================================================

Desktop-first.

Resolução prioritária:

1440x900

Também funcionar bem em 1920x1080.

Estrutura:

SIDEBAR ESQUERDA

+

TOP HEADER

+

ÁREA PRINCIPAL OPERACIONAL.

SIDEBAR:

aproximadamente 230px.

Background:

navy extremamente escuro.

Logo no topo:

AquaGraph

"Aqua" branca.

"Graph" cyan.

Abaixo:

Sistema Nervoso Digital da Água Urbana

Menu:

Visão Geral

OPERAÇÃO

Perdas e Vazamentos

Seca e Resiliência

Enchentes e Resposta

INTELIGÊNCIA

Active Sensing

Infraestrutura

Consumo

GESTÃO

Manutenção

Relatórios

Configurações no final.

Cada item deve ter ícone Lucide.

Item ativo:

background cyan muito sutil,

borda esquerda cyan,

ícone cyan,

texto branco.

Nada de sidebar enorme ou com ícones gigantes.

==================================================

7. TOP HEADER

==================================================

Header horizontal sofisticado.

Esquerda:

breadcrumb ou nome da página.

Direita:

Status do sistema:

"Operação normal"

Indicador verde.

Cidade:

Ribeirão das Águas — SP

Data:

26 Jan 2026

Hora simulada:

10:24

ícone notificações com badge.

Usuária:

AS

Ana Silva

Operadora

Criar pequeno avatar circular com iniciais.

==================================================

8. TELA 01 — VISÃO GERAL

==================================================

Criar uma CENTRAL OPERACIONAL.

Título:

Centro Operacional

Subtítulo:

Visão integrada da situação hídrica da cidade

Primeira linha:

4 KPIs executivos.

KPI 1:

PERDA ESTIMADA

12,4%

-2,1 p.p.

KPI 2:

RESERVATÓRIOS

42%

-8 p.p.

KPI 3:

ÁREAS CRÍTICAS

8

+2

KPI 4:

CONFIANÇA DO MODELO

92%

Alta confiabilidade

Cada KPI deve ter:

ícone,

valor principal,

variação,

mini sparkline.

Abaixo:

MAPA OPERACIONAL GRANDE.

Esse mapa deve dominar a página.

Não colocar apenas uma pequena imagem.

Mapa ocupando aproximadamente 65% da largura.

Criar mapa urbano escuro.

Pode ser:

SVG customizado

ou

MapLibre sem dependência de API externa.

Representar:

rios,

vias,

setores,

tubulações,

reservatórios,

estações,

sensores.

Rede hídrica:

linhas cyan.

Setores:

polígonos discretos.

Pontos:

sensores,

bombas,

válvulas,

reservatórios.

Criar hotspots:

Setor 14-B:

vermelho.

Setor 08-C:

laranja.

Setor 21-D:

amarelo.

Setor 12-A:

azul.

Na lateral direita do mapa:

Painel:

EVENTOS PRIORITÁRIOS

Evento 1:

Setor 14-B

Possível vazamento

Probabilidade 87%

Crítico

Evento 2:

Reservatório Norte

Tendência de escassez

53 dias

Atenção

Evento 3:

Avenida B

Risco hidrológico

1h20

Alto

Abaixo:

AÇÕES RECOMENDADAS

1.

Inspecionar setor 14-B

2.

Avaliar redução de pressão noturna

3.

Verificar galeria 231

Adicionar botão:

"Ver centro de decisões"

==================================================

9. MAPA — CAMADAS

==================================================

Criar painel flutuante:

CAMADAS

checkboxes:

Rede de água

Setores de abastecimento

Probabilidade de vazamento

Sensores IoT

Reservatórios

Rede de drenagem

Risco de enchente

Infraestrutura crítica

Criar controles:

+

-

centralizar

Criar search:

"Buscar endereço, setor ou ativo..."

==================================================

10. TELA 02 — PERDAS E VAZAMENTOS

==================================================

Título:

Perdas e Vazamentos

Subtítulo:

Detecção preditiva de anomalias e priorização inteligente de inspeções

KPIs:

Perda estimada

12,4%

Volume estimado perdido

58 m³/h

Setores críticos

8

Confiança

92%

Mapa grande.

Destacar Setor 14-B.

Criar heatmap sobre região.

Ao clicar no Setor 14-B abrir DETAIL DRAWER lateral.

DRAWER:

Setor 14-B

Status:

CRÍTICO

Probabilidade de vazamento:

87%

Perda estimada:

41–58 m³/h

Pressão:

-8%

Vazão:

+16%

Consumo esperado:

Normal

Última manutenção:

118 dias

Mostrar:

"Principais evidências"

Queda anormal de pressão

Vazão incompatível com consumo

Comportamento noturno atípico

Histórico de manutenção

==================================================

11. EXPLICAÇÃO DA IA

==================================================

Dentro do drawer colocar:

POR QUE O MODELO GEROU ESTE ALERTA?

Mostrar visualmente:

Pressão

↓ 8%

Vazão

↑ 16%

Consumo

≈ normal

Histórico

2 ocorrências

Conclusão:

"Os dados combinados indicam padrão consistente com perda física na rede."

Não fingir certeza absoluta.

Mostrar:

Confiança:

87%

==================================================

12. TRECHOS PRIORITÁRIOS

==================================================

Criar seção:

TRECHOS MAIS PROVÁVEIS

1.

Tubo 481

Probabilidade 87%

2.

Tubo 487

Probabilidade 79%

3.

Tubo 492

Probabilidade 68%

Mostrar cada tubo destacado no mapa.

==================================================

13. AÇÃO OPERACIONAL

==================================================

Criar card:

AÇÃO RECOMENDADA

"Inspecionar setor 14-B"

Prioridade:

ALTA

Janela recomendada:

Próximas 4 horas

Equipe sugerida:

Equipe Campo 03

Botão principal:

GERAR ORDEM DE SERVIÇO

Ao clicar:

abrir modal.

Número:

OS-AG-2048

Ativo:

Setor 14-B

Prioridade:

Alta

Equipe:

Campo 03

Prazo:

Hoje 14:30

Mostrar toast:

"Ordem de serviço criada com sucesso."

==================================================

14. SIMULAÇÃO DE VAZAMENTO

==================================================

Adicionar botão no topo:

SIMULAR EVENTO

Dropdown:

Vazamento progressivo

Ao executar:

animar:

probabilidade:

42%

61%

74%

87%

mapa gradualmente ficando amarelo,

laranja,

vermelho.

Mostrar notificação:

"Anomalia hidráulica detectada."

Isso será usado durante o pitch.

==================================================

15. TELA 03 — SECA E RESILIÊNCIA

==================================================

Título:

Seca e Resiliência

Subtítulo:

Projeção de criticidade, cenários operacionais e resposta preventiva

KPIs:

Nível dos reservatórios:

42%

Dias até criticidade:

53 dias

Cenário adverso:

34 dias

Demanda:

1,42 m³/s

==================================================

16. GRÁFICO DE RESERVATÓRIOS

==================================================

Criar gráfico grande.

Título:

Tendência dos Reservatórios

Período:

Jan → Set.

Três linhas:

Nível real

Cenário base

Cenário adverso

Criar faixa horizontal:

ZONA CRÍTICA

abaixo de 25%.

Linha base deve atingir criticidade em:

53 dias.

Linha adversa:

34 dias.

==================================================

17. CENÁRIOS SIMULADOS

==================================================

Criar painel:

CENÁRIOS SIMULADOS

Cenário atual

53 dias

Redução de pressão noturna

78 dias

+25 dias

Transferência entre setores

71 dias

+18 dias

Campanha direcionada

69 dias

+16 dias

Cada cenário deve poder ser selecionado.

Ao clicar:

atualizar gráfico.

==================================================

18. SIMULADOR OPERACIONAL

==================================================

Botão:

SIMULAR NOVO CENÁRIO

Abrir modal sofisticado.

Configurações:

Redução de pressão:

slider 0–20%

Transferência de água:

toggle

Campanha de consumo:

toggle

Chuva projetada:

Normal

Abaixo da média

Crítica

Botão:

EXECUTAR SIMULAÇÃO

Depois:

mostrar animação de processamento.

Resultado:

"Horizonte operacional ampliado de 53 para 76 dias."

Mostrar:

+23 dias.

==================================================

19. MAPA DE ESTIAGEM

==================================================

Criar mapa menor.

Setor Norte:

38 dias

Setor Centro:

62 dias

Setor Leste:

28 dias

Cores:

verde

amarelo

laranja

vermelho.

==================================================

20. TELA 04 — ENCHENTES

==================================================

Título:

Enchentes e Resposta Rápida

Subtítulo:

Antecipação de risco hidrológico e coordenação operacional em tempo quase real

KPIs:

Chuva prevista:

74 mm / 3h

Risco hidrológico:

ALTO

Áreas críticas:

12

Tempo até pico:

43 min

==================================================

21. MAPA DE ENCHENTES

==================================================

Essa tela deve ser visualmente muito impactante.

Criar mapa grande.

Representar:

rio principal

canais

rede de drenagem

vias

edificações

infraestrutura crítica.

Aplicar heatmap de inundação.

Cores:

azul

amarelo

laranja

vermelho.

Pontos:

RUA A

Risco crítico

43 min

AVENIDA B

Alto risco

1h20

HOSPITAL C

Área de atenção

ESCOLA D

Atenção

TERMINAL E

Monitoramento

==================================================

22. OCORRÊNCIAS PRIORIZADAS

==================================================

Painel lateral:

OCORRÊNCIAS PRIORIZADAS

Rua A — Centro

Alagamento provável

CRÍTICO

43 min

Avenida B

Acúmulo previsto

ALTO

1h20

Hospital C

Risco de isolamento

ATENÇÃO

2h10

==================================================

23. AÇÕES PARA ENCHENTES

==================================================

AÇÕES RECOMENDADAS

Inspecionar galeria 231

Alta

Mobilizar equipe para bomba 07

Alta

Bloquear via Y

Média

Alertar Defesa Civil

Média

Cada ação deve ter:

ícone,

prioridade,

justificativa,

tempo.

==================================================

24. SIMULAR TEMPESTADE

==================================================

Botão:

SIMULAR CHUVA EXTREMA

Ao executar:

mostrar chuva prevista aumentando.

12 mm

28 mm

47 mm

74 mm

Heatmap começa azul.

Depois amarelo.

Depois laranja.

Depois vermelho.

Criar alerta visual:

"RISCO CRÍTICO DETECTADO"

"Rua A poderá atingir nível crítico em aproximadamente 43 minutos."

Não utilizar popup exagerado.

Utilizar notification banner operacional elegante.

==================================================

25. TELA 05 — ACTIVE SENSING

==================================================

ESTA É UMA DAS TELAS MAIS IMPORTANTES DO PRODUTO.

Título:

Active Sensing

Subtítulo:

A inteligência que indica onde observar para reduzir incerteza operacional

Explicação pequena:

"O AquaGraph identifica regiões em que novos sensores gerariam maior ganho de informação para o modelo."

==================================================

26. MAPA ACTIVE SENSING

==================================================

Mostrar mapa da cidade.

Sensores atuais:

círculos cyan.

Criar aproximadamente:

18 sensores.

Mostrar cobertura estimada.

Áreas bem monitoradas:

azul/cyan.

Áreas de alta incerteza:

amarelo/vermelho.

Criar toggle:

Cobertura atual

Incerteza

Recomendação IA

==================================================

27. RECOMENDAÇÃO DE SENSOR

==================================================

Mostrar ponto pulsante:

RECOMENDAÇÃO S-27

Local:

Interseção hidráulica — Setor 17-C

Tipo:

Sensor pressão + vazão

Mostrar card:

GANHO ESTIMADO

Cobertura informacional:

68% → 89%

Incerteza:

31% → 13%

Detecção antecipada:

+24%

Área beneficiada:

3 setores

Prioridade:

ALTA

==================================================

28. SIMULAÇÃO ANTES/DEPOIS

==================================================

Criar comparação visual:

ANTES

Cobertura:

68%

Incerteza:

31%

DEPOIS

Cobertura:

89%

Incerteza:

13%

Botão:

SIMULAR INSTALAÇÃO

Ao clicar:

animar novo sensor entrando no mapa.

Expandir área cyan.

Atualizar métricas.

Mostrar:

"+21 p.p. de cobertura"

"-18 p.p. de incerteza"

==================================================

29. JUSTIFICATIVA DO ACTIVE SENSING

==================================================

Painel:

POR QUE ESTE LOCAL?

Mostrar:

Alta variabilidade hidráulica

Baixa cobertura de sensores

Intersecção de três setores

Histórico de incidentes

Alto impacto informacional

Isso precisa transmitir explicabilidade.

==================================================

30. CENTRO DE DECISÕES

==================================================

Criar página adicional:

Centro de Decisões

Mostrar todas as recomendações da IA.

Tabela sofisticada:

AÇÃO

TIPO

LOCAL

IMPACTO

CONFIANÇA

PRIORIDADE

STATUS

Exemplos:

Inspecionar setor 14-B

Perdas

Setor 14-B

Alto

87%

Crítica

Pendente

Reduzir pressão noturna

Seca

Setor Leste

+25 dias

91%

Alta

Simulada

Inspecionar galeria 231

Enchente

Centro

Alto

89%

Alta

Pendente

Instalar sensor S-27

Active Sensing

Setor 17-C

+21 p.p.

86%

Alta

Planejada

==================================================

31. MODO PITCH

==================================================

Criar funcionalidade especial:

MODO PITCH

Botão discreto no header:

"Iniciar Demo"

Ao clicar:

abrir barra inferior com:

Etapa 1 de 5

e controles:

Anterior

Próximo

Encerrar Demo

Fluxo:

ETAPA 1

Visão Geral

Texto pequeno:

"Uma cidade inteira vista como um único sistema hídrico."

ETAPA 2

Vazamento

Automaticamente executar cenário do Setor 14-B.

ETAPA 3

Seca

Mostrar projeção e simulação.

ETAPA 4

Enchente

Executar chuva extrema.

ETAPA 5

Active Sensing

Mostrar recomendação do sensor S-27.

No final:

Tela overlay:

AquaGraph

"De monitoramento para decisão."

"Antecipar. Priorizar. Agir."

Botão:

Encerrar demonstração

==================================================

32. MICROINTERAÇÕES

==================================================

Criar animações elegantes e discretas.

Exemplos:

cards entrando com fade.

KPIs atualizando suavemente.

linhas dos gráficos animadas.

hotspots pulsando discretamente.

sensor recomendado pulsando.

mapa atualizando heatmap.

drawer deslizando lateralmente.

toasts.

Não usar animações exageradas.

==================================================

33. DETALHES DE UX

==================================================

Todo gráfico deve possuir tooltip.

Todo ícone importante deve possuir tooltip.

Criar hover states.

Criar estados selecionados.

Badges:

Normal

Atenção

Alto

Crítico.

Cores sempre consistentes.

Verde:

normal.

Amarelo:

atenção.

Laranja:

alto.

Vermelho:

crítico.

==================================================

34. MAPAS

==================================================

Não quero mapas simplórios.

Criar aparência de GIS profissional.

Adicionar:

vias

rios

setores

bairros

rede hidráulica

rede de drenagem

infraestrutura.

As tubulações devem parecer uma rede conectada.

Criar diferentes espessuras para:

adutoras

rede principal

rede secundária.

Adicionar pequenas válvulas e sensores.

==================================================

35. VISUAL DOS CARDS

==================================================

Cards não devem parecer caixas isoladas.

Evitar bordas muito fortes.

Utilizar:

background levemente diferente do fundo.

border 1px extremamente sutil.

border-radius:

10–12px.

Padding:

16–20px.

Sombras quase imperceptíveis.

==================================================

36. ÍCONES

==================================================

Utilizar Lucide.

Não usar emojis.

Exemplos:

Droplets

Gauge

Activity

TriangleAlert

CloudRain

Database

Map

MapPin

Radio

Waves

Shield

BrainCircuit

Network

Workflow

Gauge

Settings

Bell

ChartNoAxesCombined

Pipe

CircleGauge

==================================================

37. DADOS MOCKADOS

==================================================

Criar arquivos separados:

city.ts

waterNetwork.ts

sensors.ts

reservoirs.ts

leaks.ts

floodEvents.ts

recommendations.ts

droughtScenarios.ts

Usar dados realistas.

Evitar:

12345

Lorem ipsum

"Empresa XYZ"

A cidade fictícia é:

Ribeirão das Águas — SP

Setores:

08-C

12-A

14-B

17-C

21-D

Reservatórios:

Reservatório Norte

Reservatório Central

Reservatório Sul

==================================================

38. MÉTRICAS

==================================================

Não apresentar estimativas como fatos comprovados.

Quando algo for resultado de modelo:

utilizar:

"estimado"

"probabilidade"

"projeção"

"cenário"

"confiança"

Evitar linguagem que pareça garantia absoluta.

==================================================

39. RESPONSIVIDADE

==================================================

Desktop prioritário.

Em telas menores:

sidebar pode colapsar.

Não destruir o dashboard.

Mapas devem permanecer utilizáveis.

==================================================

40. NÍVEL VISUAL ESPERADO

==================================================

Quero estética comparável a produtos como:

Palantir Foundry

Esri ArcGIS dashboards

IBM Environmental Intelligence

Bentley Infrastructure Cloud

Siemens Smart Infrastructure

Schneider Electric EcoStruxure

NÃO copiar essas interfaces.

Usar apenas como referência de maturidade e densidade operacional.

O resultado final precisa parecer um produto enterprise de infraestrutura crítica.

==================================================

41. NÃO FAZER

==================================================

NÃO criar landing page.

NÃO colocar hero section.

NÃO criar cards gigantes com números soltos.

NÃO usar gradient purple/pink.

NÃO usar glassmorphism excessivo.

NÃO utilizar texto enorme.

NÃO encher tudo de sombras.

NÃO fazer layout genérico de admin template.

NÃO criar interface branca.

NÃO transformar o sistema em uma aplicação de consumidor.

NÃO usar emojis.

NÃO criar funcionalidades aleatórias além do escopo.

==================================================

42. PRIMEIRA ENTREGA

==================================================

Antes de adicionar funcionalidades secundárias, implementar completamente:

1. App Shell

2. Visão Geral

3. Perdas e Vazamentos

4. Seca e Resiliência

5. Enchentes

6. Active Sensing

7. Centro de Decisões

8. Modo Pitch

Todas essas páginas devem estar navegáveis.

==================================================

43. CRITÉRIO DE ACEITE

==================================================

Ao abrir o produto, a sensação precisa ser:

"Isso poderia estar rodando em um centro de operações de uma cidade."

Ao navegar pelas telas, a sensação deve ser:

"Esses módulos fazem parte da mesma plataforma."

Ao executar os cenários, deve ficar evidente:

DADOS

↓

INTELIGÊNCIA

↓

PREVISÃO

↓

RECOMENDAÇÃO

↓

AÇÃO

A narrativa principal do AquaGraph é:

HOJE:

os operadores descobrem o problema depois que ele aparece.

COM AQUAGRAPH:

eles conseguem identificar sinais,

antecipar cenários,

simular alternativas,

priorizar ações

e agir antes.

A aplicação inteira deve reforçar essa narrativa.

==================================================

44. MUITO IMPORTANTE SOBRE AS IMAGENS DE REFERÊNCIA

==================================================

As imagens anexadas mostram a direção visual oficial do AquaGraph.

Usá-las como referência prioritária.

Reproduzir especialmente:

- densidade das informações;

- dark navy UI;

- cyan como cor tecnológica;

- mapas operacionais;

- sidebar;

- KPIs;

- painéis laterais;

- estilo das tabelas;

- estilo dos alerts;

- estilo dos gráficos;

- uso moderado de transparência;

- contraste entre informação operacional e mapa.

Não tente "melhorar" transformando o layout em outro estilo.

O objetivo é transformar aqueles mockups de apresentação em um produto navegável real.

==================================================

45. ENTREGA

==================================================

Implemente diretamente a interface.

Não me entregue apenas documentação.

Não crie uma tela inicial perguntando configurações.

Não crie wizard.

Comece pelo Centro Operacional.

Utilize dados mockados desde a primeira renderização.

Todas as páginas precisam ter conteúdo visual real desde o início.

Priorize qualidade visual, coerência e experiência de demonstração acima de funcionalidades backend.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cec6f125-d3ea-445a-946e-de1d03e83ed6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
