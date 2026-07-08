---
name: configurar-o-monitoramento
title: "Configurar o monitoramento"
description: "Configure o monitoramento operacional que você precisa para não voar às cegas. Escolha o que você precisa: uma única métrica que eu capturo diariamente no seu warehouse, ou uma especificação completa de dashboard com seções, visualizações, cadência e SQL somente leitura por trás de cada gráfico. Eu redijo a especificação, você ou sua ferramenta de BI a renderiza."
version: 1
category: Operações
featured: no
image: clipboard
---


# Configurar o Monitoramento

Uma skill para o monitoramento que você precisa. O parâmetro `scope` escolhe o formato: uma definição de métrica única com capturas diárias, ou uma especificação completa de dashboard (seções + visualizações + cadência + SQL por visualização). As duas escrevem apenas SQL somente leitura e se baseiam no seu contexto operacional.

## Parâmetro: `scope`

- `metric`  -  define uma única métrica, escreve o SQL somente leitura contra o seu warehouse, captura o valor atual em `metrics-daily.json`, adiciona a definição em `config/metrics.json`, e a registra na cadência escolhida. Saída: `config/metrics.json` atualizado + `metrics-daily.json` + `queries/{metric-slug}/`.
- `dashboard`  -  propõe de 2 a 4 seções, visualizações por seção, cadência, e o SQL somente leitura por trás de cada visualização. Apenas especificação  -  você ou sua ferramenta de BI renderiza. Saída: `config/dashboards.json` (adicionado ou atualizado por id).

O usuário nomeia o scope em linguagem simples ("acompanhar receita mensal", "monitorar usuários ativos semanais", "especificar um dashboard de crescimento", "quero ver retenção regularmente") -> eu infiro. Ambíguo -> pergunto UMA pergunta nomeando as duas opções.

## Quando usar

**metric:**
- "comece a acompanhar {X}" / "adicione {métrica} ao dashboard" / "monitore {métrica chave}"
- Uma métrica nomeada pelo usuário em `onboard-me` tem um placeholder vazio em `sqlSnippet`, o usuário invoca esta skill para construir a definição real.

**dashboard:**
- "especifique um dashboard para {X}"
- "quero ver {grupo de métricas} regularmente"
- "construa um dashboard para o time de {crescimento / retenção / churn / receita}"

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar eu verifico se as categorias abaixo estão conectadas. Faltando -> eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Warehouse / fonte de dados** (Postgres, BigQuery, Snowflake, Redshift)  -  Obrigatório para `scope=metric` (eu não consigo capturar uma métrica sem uma fonte para ler). Opcional para `scope=dashboard` (me permite escrever trechos de SQL que rodam no seu schema real; sem isso eu deixo placeholders parametrizados).
- **Cobrança** (Stripe)  -  Opcional para `scope=metric`. Me permite conectar métricas de receita diretamente da cobrança em vez de inferir a partir do warehouse.

Para `scope=metric` eu paro se nenhum warehouse estiver conectado. Para `scope=dashboard` eu nunca bloqueio  -  isso produz uma especificação, não um dashboard renderizado.

## Informações que eu preciso

Eu leio primeiro o seu contexto operacional. Para cada campo obrigatório que estiver faltando eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Definição da métrica**  -  Obrigatório para `scope=metric`. Por que preciso: 'receita mensal' pode significar baseada em cobrança, baseada em contrato, ou receita anual / 12  -  preciso saber qual. Se faltando eu pergunto: "O que exatamente essa métrica significa? Para receita: você está contando assinaturas ativas, receita reconhecida, ou outra coisa?"
- **Onde essa métrica vive**  -  Obrigatório para `scope=metric`. Por que preciso: preciso da fonte da verdade para escrever o SQL. Se faltando eu pergunto: "Qual sistema é a fonte da verdade para esse número  -  seu warehouse, sua ferramenta de cobrança, seu banco de dados de produto?"
- **Direção e unidade**  -  Obrigatório para `scope=metric`. Por que preciso: define a classificação (melhorou / piorou) e a formatação. Se faltando eu pergunto: "Quanto maior é melhor, quanto menor é melhor, ou existe uma meta? E é uma contagem, valor em dinheiro, percentual, ou outra coisa?"
- **Cadência**  -  Opcional para `scope=metric`. Por que preciso: define a frequência da captura. Se você não tiver isso eu sigo com diária como padrão.
- **Propósito do dashboard**  -  Obrigatório para `scope=dashboard`. Por que preciso: um dashboard de crescimento e um dashboard de retenção têm seções diferentes. Se faltando eu pergunto: "Para que é esse dashboard, e o que você faria com ele?"
- **Público e cadência**  -  Obrigatório para `scope=dashboard`. Por que preciso: molda o layout e a frequência de atualização. Se faltando eu pergunto: "Quem vai olhar isso e com que frequência  -  você diariamente, seu time semanalmente, o board mensalmente?"
- **O que você já está acompanhando**  -  Obrigatório para `scope=dashboard`. Por que preciso: eu prefiro conectar dashboards a métricas que você já captura em vez de inventar novas. Se faltando eu pergunto: "Quais números você já acompanha mais de perto?"
- **Prioridades ativas**  -  Obrigatório para `scope=dashboard`. Por que preciso: define quais métricas vão no bloco principal. Se faltando eu pergunto: "Quais são as 2 a 3 coisas que a empresa está priorizando neste trimestre?"

## Passos

### Passos compartilhados (ambos os scopes)

1. **Ler `context/operations-context.md`.** Se faltando ou vazio, parar. Pedir ao usuário para rodar `set-up-my-ops-info` primeiro.

### Ramificar em `scope`:

#### `metric`

2. **Esclarecer se necessário.** Se a frase for ambígua ("receita mensal" pode ser baseada em cobrança, baseada em contrato, ou receita anual / 12), fazer UMA pergunta objetiva. Senão, prosseguir.

3. **Identificar a fonte.** Ler `config/data-sources.json`. Se o usuário não nomeou a fonte, escolher a mais provável a partir de `config/business-context.md` (warehouse para métricas centrais do negócio, banco de dados de produto para engajamento).

4. **Verificar métricas existentes.** Ler `config/metrics.json`. Se uma métrica com o mesmo slug ou nome extremamente parecido existir, avisar o usuário, oferecer atualização em vez de duplicata.

5. **Confirmar schema.** Ler `config/schemas.json` para as tabelas referenciadas. Se faltarem entradas, fazer introspecção preguiçosa (mesmo padrão de `ask-a-data-question` passo 3).

6. **Redigir o SQL.** Retornar um `SELECT` que resolve para um único valor numérico para uma data dada. Usar o placeholder `{{date}}`, o agendador substitui na execução. Exemplo (dialeto BigQuery):

   ```sql
   SELECT SUM(amount) AS value
   FROM `project.dataset.subscriptions`
   WHERE state = 'active'
     AND start_date <= DATE('{{date}}')
     AND (end_date IS NULL OR end_date > DATE('{{date}}'))
   ```

7. **Autoverificar somente leitura.** Buscar por palavras-chave proibidas de DML/DDL. Recusar se alguma aparecer.

8. **Capturar cadência, direção, unidade.** Fazer UMA pergunta se não especificado:
   - `cadence: "daily"` como padrão.
   - `direction`  -  maior-é-melhor / menor-é-melhor / meta-é-melhor.
   - `unit`  -  contagem / moeda / percentual / proporção / duração / outro.
   NÃO fixar limites (thresholds)  -  deixar `thresholds` vazio; se o usuário quiser um sigma customizado para detecção de anomalias, sobrescrever depois.

9. **Adicionar a definição da métrica** em `config/metrics.json`. Também registrar a query reutilizável em `queries/{metric-slug}/` para auditoria (`ask-a-data-question` a reutiliza). Atualizar `queries.json`.

10. **Capturar agora.** Executar o SQL com `{{date}}` = hoje (fuso horário do warehouse, padrão UTC). Adicionar a `metrics-daily.json` com `{ id, metricId, date, value, changeVsPrev, changeVs7dAvg, changeVs28dAvg, createdAt }`. Campos de mudança nulos na primeira captura.

11. **Retroagir se solicitado.** Se o usuário disser "retroaja os últimos N dias," repetir o SQL nas datas, adicionar cada captura. Avisar sobre custo antes (comparar o total estimado de bytes escaneados contra o teto).

12. **Adicionar a `outputs.json`** com `type: "metric-definition"`, status "ready".

13. **Relatar.** Valor atual + cadência + onde aparece no dashboard + nota de que `analyze-my-data subject=anomaly` sinaliza desvios após acumular >= 7 capturas.

#### `dashboard`

2. **Esclarecer público + cadência.** Se não estiver claro: "Quem vai olhar isso e com que frequência? (operador diariamente / executivo semanalmente / time de crescimento diariamente / sob demanda)." Padrões: `audience: "operator"`, `cadence: "daily"`.

3. **Propor lista de métricas.** A partir de `config/metrics.json`, escolher métricas que se encaixem no propósito. Se o usuário nomeou métricas não acompanhadas, incluir como placeholders com `sqlSnippet: ""` e recomendar rodar esta skill com `scope=metric` primeiro.

4. **Desenhar seções.** Máximo de 2 a 4 seções. Formato canônico:
   - **Métricas principais**  -  de 3 a 5 blocos de número único para o que é essencial.
   - **Tendências**  -  séries temporais de 30/60/90 dias para métricas chave.
   - **Detalhamento**  -  visão segmentada (segmento / área de produto / coorte / canal).
   - **Anomalias / alertas** (opcional)  -  últimos outliers sinalizados a partir de `anomalies.json`.

5. **Detalhes por visualização.** Cada visualização especificar:
   - `title`
   - `chart`: `line` | `bar` | `number` | `sparkline` | `funnel` | `table`
   - `metricId` se corresponder a uma métrica acompanhada
   - `sqlSnippet`  -  SQL somente leitura parametrizado usando placeholders `{{date}}` / `{{startDate}}` / `{{endDate}}`
   - `notes`  -  ressalvas de interpretação ou sinalizações conhecidas de qualidade de dados

6. **Autoverificar somente leitura.** Todo `sqlSnippet` deve ser apenas SELECT. Buscar por palavras-chave proibidas de DML/DDL, recusar se alguma aparecer.

7. **Escrever a especificação** em `config/dashboards.json` (atômico). Adicionar ou atualizar por `id`:

   ```json
   {
     "id": "growth-daily",
     "name": "Growth Daily",
     "audience": "growth team",
     "cadence": "daily",
     "sections": [
       {
         "title": "Top-line",
         "visualizations": [
           {
             "metricId": "signups",
             "title": "Signups (today)",
             "chart": "number",
             "sqlSnippet": "SELECT COUNT(*) AS value FROM events WHERE event='signup' AND DATE(ts) = DATE('{{date}}')",
             "notes": "Excludes bots flagged in users.is_bot"
           }
         ]
       }
     ],
     "createdAt": "...",
     "updatedAt": "..."
   }
   ```

8. **Adicionar a `outputs.json`** com `type: "dashboard-spec"`, status "ready".

9. **Relatar.** Apresentar a especificação no chat, um resumo de uma linha por seção. Próximo passo: "Cole essa especificação na sua ferramenta de BI ou peça para eu traduzir uma visualização específica para {sua ferramenta}."

## O que eu nunca faço

- **Fixar limite de sigma.** Sobrescritas por métrica vivem em `config/metrics.json` -> `thresholds`. O padrão de 2-sigma vive no padrão documentado de `analyze-my-data subject=anomaly`  -  não é embutido nos registros de métrica.
- **Executar DML/DDL.** A regra de somente leitura se aplica a todo trecho de SQL, toda query de métrica, toda query de visualização. A busca por palavras-chave proibidas recusa qualquer outra coisa.
- **Capturar sem um valor atualizado.** Se a query retornar NULL, registrar a captura com uma nota de `possibleCauses` na próxima varredura de anomalias, avisar o usuário.
- **Renderizar um HTML / dashboard renderizado.** Apenas especificação  -  a visão do agente Houston é separada, cobre a visão do operador. Sua ferramenta de BI renderiza essa especificação.
- **Assumir uma ferramenta de BI específica.** A especificação é agnóstica de ferramenta, com placeholders de parâmetros.

## Saídas

- `scope=metric`:
  - `config/metrics.json` atualizado
  - Linhas adicionadas em `metrics-daily.json`
  - Novo `queries/{metric-slug}/query.sql`, `notes.md`
  - `queries.json` atualizado
  - Possivelmente `config/schemas.json` atualizado
  - Adiciona a `outputs.json` com `type: "metric-definition"`.
- `scope=dashboard`:
  - `config/dashboards.json` atualizado
  - Adiciona a `outputs.json` com `type: "dashboard-spec"`.
