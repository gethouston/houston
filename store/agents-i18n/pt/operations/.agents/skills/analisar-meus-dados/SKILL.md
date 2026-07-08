---
name: analisar-meus-dados
title: "Analisar meus dados"
description: "Receba uma análise rigorosa do que seus dados estão realmente dizendo. Escolha o que você precisa: um relatório de experimento com o lift, a significância estatística, os intervalos de confiança e uma recomendação explícita de lançar, descartar, iterar ou inconclusivo; uma varredura de anomalias que sinaliza métricas que se desviam das suas linhas de base móveis com causas hipotéticas; ou uma auditoria de qualidade de dados que verifica nulos, duplicatas, atualidade e integridade referencial nas tabelas que importam para você."
version: 1
category: Operações
featured: no
image: clipboard
---


# Analisar Meus Dados

Um primitivo analítico. Três tarefas de dados: relatórios de experimento, varreduras de anomalias, auditorias de qualidade de dados (DQ). Rigor por padrão, nunca recomendo LANÇAR sem significância, nunca chamo algo de anomalia sem linha de base, nunca pulo as ressalvas nos achados de DQ.

## Quando usar

- `subject=experiment` - "analise o teste {X}" / "como foi o experimento {Y}" / "relatório do teste A/B".
- `subject=anomaly` - "algo estranho nos dados hoje" / "verificação de anomalias" / "varredura diária de anomalias" / "por que {métrica} disparou".
- `subject=data-qa` - "verifique a qualidade dos dados na tabela {X}" / "por que esse número está errado" / "rode uma auditoria de DQ no warehouse".

## Conexões que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Warehouse / fonte de dados** (Postgres, BigQuery, Snowflake, Redshift) - Obrigatório. SQL somente leitura para extrair variantes, linhas de base de anomalias, verificações de DQ.
- **Plataforma de experimentos** (PostHog, Mixpanel, Amplitude) - Opcional. Usado quando `subject=experiment` e o teste está em uma ferramenta de analytics de produto. Se nenhuma estiver conectada, trabalho a partir de agregados colados.

Se nenhum warehouse estiver conectado, paro e peço para você conectar seu warehouse primeiro.

## Informações que preciso

Leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Estágio da empresa** - Obrigatório. Por que preciso: define os padrões sensatos de tamanho de amostra e efeito mínimo detectável nos experimentos. Se faltar, pergunto: "Como você descreveria seu estágio agora, pré-lançamento, primeiros usuários, em escala, ou estável?"
- **Onde estão os dados do seu negócio** - Obrigatório. Por que preciso: preciso saber qual warehouse consultar. Se faltar, pergunto: "Onde estão os dados do seu negócio? O ideal é conectar seu warehouse na aba Integrações para que eu possa ler diretamente."
- **O que você já monitora** - Obrigatório para `subject=anomaly`. Por que preciso: varro as métricas que você já acompanha e sinalizo desvios. Se faltar, pergunto: "Quais números você acompanha mais de perto? Você pode listá-los ou, melhor ainda, conectar o painel onde eles ficam."
- **Formato das tabelas e expectativas de atualidade** - Opcional para `subject=data-qa`. Por que preciso: ajuda a saber quais colunas não deveriam ter nulos e quão desatualizada uma tabela pode ficar. Se você não tiver isso, sigo em frente com TBD e infiro a partir de uma amostra.

## Parâmetro: `subject`

- `experiment` - analisa um teste. Entradas: dados de variantes (consulta ao warehouse ou colados), hipótese, métrica primária, guardrails. Saída: `analyses/experiment-{slug}-{YYYY-MM-DD}.md` com a recomendação de lançar, descartar, iterar ou inconclusivo-estender.
- `anomaly` - varre cada métrica em `config/metrics.json` com 7 ou mais registros; sinaliza desvios além do limite específico da métrica ou do padrão (2σ amarelo / 3σ vermelho). Saída: `analyses/anomaly-sweep-{YYYY-MM-DD}.md` + upsert em `anomalies.json`.
- `data-qa` - verificações de DQ somente leitura nas tabelas alvo: nulos por coluna, duplicatas nas chaves naturais, atualidade (MAX(updated_at) versus desatualização esperada), integridade referencial nos joins-chave, surpresas de cardinalidade. Saída: `data-quality-reports/{YYYY-MM-DD}/report.md`.

## Passos

1. Leio `config/context-ledger.json`; preencho lacunas com UMA pergunta classificada por modalidade.
2. Leio `context/operations-context.md`, as prioridades ativas e os limites inegociáveis ancoram o que conta como "material".
3. Ramifico conforme `subject`:

   **Se `subject = experiment`:**
   - Leio hipótese, variantes, métrica primária, guardrails. Se faltar, pergunto em um único turno (hipótese + controle + variante + métrica primária + guardrails).
   - Puxo os dados de variante via warehouse (SQL somente leitura) ou aceito agregados colados.
   - Calculo: lift (variante versus controle), significância (teste-z para proporções, teste-t para contínuas), IC de 95%, MDE observado, deltas de guardrail.
   - Faço a recomendação:
     - LANÇAR - a métrica primária se move com p < 0,05, guardrails limpos, limite inferior do IC maior que o MDE prático.
     - DESCARTAR - métrica primária estável OU guardrails pioram materialmente.
     - ITERAR - direcional, ainda não significativo, guardrails limpos; especifico a próxima variante.
     - INCONCLUSIVO-ESTENDER - poder estatístico baixo demais; calculo o tempo de execução necessário.
   - Escrevo o relatório: cada número, a recomendação, o raciocínio.

   **Se `subject = anomaly`:**
   - Leio `config/metrics.json`; para cada métrica com 7 ou mais registros, calculo linhas de base móveis de 7 e 28 dias.
   - Comparo o valor mais recente com as linhas de base; sinalizo o que passar do limite específico da métrica ou do padrão (2σ / 3σ).
   - Para cada métrica sinalizada, formulo de 1 a 3 hipóteses de causa a partir de: decisões recentes em `decisions.json`, deploys recentes em `context/operations-context.md`, experimentos recentes em `outputs.json`, padrões sazonais conhecidos.
   - Faço upsert em `anomalies.json` com `{id, metric, severity, observedAt, baseline, deviation, hypotheses[], status: "open"}`.

   **Se `subject = data-qa`:**
   - Leio `config/schemas.json` para as tabelas alvo (ou o warehouse inteiro se for "tudo").
   - Por tabela:
     - Nulos por coluna (versus o esperado).
     - Duplicatas na chave natural.
     - Atualidade: `MAX(updated_at)` versus expectativa de desatualização.
     - Integridade referencial nos joins-chave (órfãos de chave estrangeira).
     - Surpresas de cardinalidade (desvio na contagem de valores versus linha de base).
   - Relatório datado: aprovado / alerta / falha por verificação + SQL usado + correção sugerida por falha.

4. Escrevo de forma atômica (`.tmp` → renomear) no caminho.
5. Adiciono a `outputs.json` com `{id, type, title, summary, path, status, createdAt, updatedAt, domain: "data"}`. Type = `"experiment-readout"` / `"anomaly-sweep"` / `"data-qa-report"`.
6. Resumo: experimentos → recomendação + motivo em uma frase; anomalias → contagem + top 3 por severidade; DQ → contagem de falhas + primeira a corrigir.

## Saídas

- `analyses/experiment-{slug}-{YYYY-MM-DD}.md` (experimento)
- `analyses/anomaly-sweep-{YYYY-MM-DD}.md` + upsert em `anomalies.json` (anomalia)
- `data-quality-reports/{YYYY-MM-DD}/report.md` (data-qa)
- Adiciona a `outputs.json`.

## O que eu nunca faço

- Recomendar LANÇAR sem significância.
- Chamar algo de anomalia sem mostrar a linha de base.
- Rodar DML / DDL, somente leitura.
- Esconder ressalvas (tamanho de amostra, sazonalidade, dados faltando) atrás do número de destaque.
