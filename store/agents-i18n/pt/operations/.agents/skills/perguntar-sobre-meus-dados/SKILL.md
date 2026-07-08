---
name: perguntar-sobre-meus-dados
title: "Perguntar sobre meus dados"
description: "Faça qualquer pergunta sobre seus dados em linguagem simples e receba uma resposta real. Eu traduzo isso para SQL somente leitura no seu warehouse conectado, aviso antes de executar algo custoso, executo, salvo a consulta para reutilização e retorno o resultado destacando qualquer ressalva, para que você não acabe usando um número que na verdade está errado."
version: 1
category: Operações
featured: no
image: clipboard
---


# Perguntar Sobre Meus Dados

## Quando usar

O usuário fez uma pergunta sobre dados. Qualquer coisa formulada como "quantos," "qual é," "top N por," "tendência de," "compare X com Y," "por que Z mudou." Traduzo para SQL, executo com segurança, retorno o resultado com citações.

## Conexões que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Warehouse / fonte de dados** (Postgres, BigQuery, Snowflake, Redshift) - Obrigatório. Executo SQL somente leitura aqui. Sem warehouse, sem resposta.

Se nenhum warehouse estiver conectado, paro e peço para você conectar seu warehouse primeiro.

## Informações que preciso

Leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Onde os dados estão** - Obrigatório. Por que preciso: preciso saber qual warehouse consultar e qual dialeto SQL usar. Se faltar, pergunto: "Onde esses dados estão? O ideal é conectar seu warehouse na aba Integrações e me dizer qual usar."
- **Limites de custo** - Opcional. Por que preciso: aviso antes de rodar algo que vá escanear mais do que seu limite. Se você não tiver isso, sigo em frente com TBD e uso um padrão conservador de 100 GB escaneados.
- **Esquemas das tabelas** - Opcional. Por que preciso: me permite redigir SQL preciso sem chutar nomes de colunas. Se você não tiver isso, eu inspeciono o warehouse na hora.
- **Documento de contexto operacional** - Obrigatório. Por que preciso: ancora o que "esse número parece estranho" significa em relação às suas prioridades. Se faltar, pergunto: "Quer que eu configure seu contexto operacional primeiro? Ajuda a identificar resultados suspeitos."

## Regras rígidas

- **Somente leitura.** Qualquer consulta proposta contendo `INSERT`, `UPDATE`,
  `DELETE`, `MERGE`, `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, `GRANT`,
  ou `REVOKE` é recusada imediatamente.
- **Aviso antes de executar uma consulta potencialmente custosa.** Uso a
  ferramenta explain / dry-run do warehouse (descubro via `composio search
  warehouse explain` ou equivalente do provedor) para estimar
  bytes escaneados + tempo de execução. Comparo com
  `config/data-sources.json` → `costCeilingScannedGb` e
  `costCeilingSeconds` para a fonte alvo. Se excedido,
  informo a estimativa, espero a aprovação explícita.
- **Todo resultado sai com**: o SQL exato, o horário de execução,
  a contagem de linhas, qualquer ressalva de qualidade de dados.

## Passos

1. **Leio `context/operations-context.md`.** Se
   faltar/estiver vazio, paro, peço ao usuário para rodar a habilidade `set-up-my-ops-info` primeiro. Prioridades + ferramentas ancoram qual
   fonte usar, o que "esse número parece estranho" significa.

2. **Identifico a fonte.** Leio `config/data-sources.json`. Se
   estiver vazio/incompleto, faço UMA pergunta: "Onde isso está?
   *O ideal, conecte seu warehouse via Composio e me diga o nome.
   Ou descreva a tabela e eu vou sinalizar isso como não verificado até
   que seja conectado.*" Escrevo, continuo.

3. **Introspecção de esquema sob demanda.** Leio `config/schemas.json`. Para
   tabelas provavelmente necessárias, se a entrada faltar ou
   `lastIntrospectedAt` tiver mais de 7 dias, rodo a ferramenta de
   introspecção de esquema do warehouse (descubro via `composio search`) para
   puxar colunas, tipos, se aceitam nulo, indícios de chave primária. Adiciono a
   `config/schemas.json`. Se a introspecção estiver bloqueada (nenhum
   warehouse conectado), peço ao usuário para conectar um, paro, sem
   chutar nomes de colunas.

4. **Redijo o SQL.** Uso o dialeto de
   `config/data-sources.json`. Prefiro CTEs para legibilidade. Aplico
   filtros de partição / cluster / data quando disponíveis. Gero
   um slug em kebab-case a partir do propósito da pergunta (ex.
   `weekly-signups-last-7d`).

5. **Autoverificação contra as regras rígidas.** Varro o texto da consulta em busca de
   palavras-chave proibidas (sem diferenciar maiúsculas/minúsculas). Se
   encontrar, recuso, paro.

6. **Estimo o custo.** Rodo a ferramenta de explain / dry-run do warehouse.
   Comparo com os limites em `config/data-sources.json` para essa
   fonte. Se acima do limite:

   > "Isso vai escanear ~{bytes em formato legível} (~{linhas}), rodar?"

   Espero a aprovação. Senão, continuo.

7. **Executo via Composio.** Rodo a consulta pela ferramenta de
   warehouse conectada (slug descoberto via `composio search
   warehouse`). Em caso de sucesso, capturo as linhas do resultado
   (limitado a 10.000 para armazenamento local; registro a contagem real de linhas separadamente).

8. **Capturo ressalvas de qualidade de dados.** Verifico o resultado em busca de
   percentuais de nulos em colunas-chave, números suspeitosamente
   redondos, retornos com zero linhas onde o usuário esperava dados, intervalos que parecem
   estranhos (contagens negativas, eventos com data futura). Listo qualquer um em `notes.md`,
   nunca escondo uma preocupação.

9. **Salvo para reutilização.** Escrevo de forma atômica:
   - `queries/{slug}/query.sql` - corpo da consulta.
   - `queries/{slug}/result-latest.csv` - resultado.
   - `queries/{slug}/notes.md` - propósito, parâmetros, dependências de esquema,
     ressalvas, metadados da última execução (horário, contagem de linhas, bytes
     escaneados).

10. **Atualizo `queries.json`.** Leio-mesclo-escrevo. Faço upsert por slug.
    Defino `{ purpose, author: "agent", sourceId, schemaDeps, tags,
    costWarning, lastRunAt, lastRowCount }`.

11. **Adiciono a `outputs.json`** com `type: "query-answer"`,
    status "ready".

12. **Retorno a resposta no chat.** Formato:

    ```
    {resposta em português simples, 1 a 3 frases}

    Consulta: `queries/{slug}/query.sql`
    Executada em: {ISO-8601}
    Linhas: {N}
    Ressalvas: {em tópicos ou "nenhuma"}
    ```

## Saídas

- `queries/{slug}/query.sql` (novo ou sobrescrito)
- `queries/{slug}/result-latest.csv` (sobrescrito)
- `queries/{slug}/notes.md` (novo ou sobrescrito)
- `queries.json` atualizado
- Possivelmente `config/schemas.json` atualizado (introspecção sob demanda)
- Adiciona a `outputs.json` com `type: "query-answer"`.

## O que eu nunca faço

- **Rodar DML/DDL**, recuso, paro.
- **Executar acima do limite de custo** sem aprovação explícita.
- **Esconder uma ressalva**, toda preocupação relevante entra em `notes.md`.
- **Inventar nomes de coluna/tabela**, se a introspecção estiver bloqueada,
  paro, peço a conexão.
