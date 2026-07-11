---
name: executar-minha-revisao-operacional
title: "Executar minha revisão operacional"
description: "Reúna o que foi entregue e o que avançou em toda a sua superfície operacional. Escolha o que você precisa: uma revisão semanal que agrega a saída de cada habilidade, cruza prioridades e renovações, sinaliza lacunas e recomenda o próximo movimento; ou um resumo de métricas que percorre cada métrica monitorada, calcula a variação semana a semana e mostra o que olhar primeiro."
version: 1
category: Operações
featured: yes
image: clipboard
integrations: [googlesheets]
---


# Executar minha revisão operacional

Ritual transversal de segunda-feira. Duas sub-revisões atrás de uma única primitiva, normalmente você quer a revisão semanal nas segundas, com o resumo de métricas alimentando ela.

## Quando usar

- `period=weekly` - "revisão operacional de segunda" / "resumo semanal" / "o que aconteceu na minha operação essa semana".
- `period=metrics-rollup` - "resumo semanal de métricas" / "como o negócio está indo essa semana" / "me dá os dados para a revisão de segunda".

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, eu verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Warehouse / fonte de dados** - Obrigatório para `period=metrics-rollup`. Extrai retratos atualizados das métricas se os diários estiverem desatualizados.
- **Rastreador de metas** (Notion, Airtable, Google Sheets) - Opcional. Permite que a revisão semanal reflita o estado atual das metas sem atualização manual.

Esta habilidade funciona sem nenhuma conexão para a revisão semanal, ela se apoia no seu trabalho salvo. Eu só bloqueio no `metrics-rollup` se nenhum warehouse estiver conectado.

## Informações que eu preciso

Eu leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > arquivo enviado > URL > colar) e espero.

- **Prioridades ativas** - Obrigatório. Por que eu preciso: a seção de lacunas versus prioridades depende delas. Se estiver faltando, eu pergunto: "Quais são as 2 a 3 coisas que a empresa está priorizando neste trimestre?"
- **Ritmo operacional** - Obrigatório. Por que eu preciso: faz "revisão de segunda" significar a coisa certa para a sua semana. Se estiver faltando, eu pergunto: "Como é a sua semana, dia de revisão, dias de trabalho focado, dias de reunião?"
- **O que você está monitorando** - Obrigatório para `period=metrics-rollup`. Por que eu preciso: o resumo percorre toda métrica que você acompanha. Se estiver faltando, eu pergunto: "Quais números você acompanha mais de perto? O melhor é conectar o painel ou warehouse onde eles vivem."
- **Ritmo com investidores** - Opcional. Por que eu preciso: permite que a revisão sinalize prazos de investidores ou do conselho se aproximando. Se você não tiver isso, eu sigo em frente com dado pendente e pulo a seção de prazos.

## Parâmetro: `period`

- `weekly` - revisão de segunda do fundador. Agrega os últimos 7 dias de `outputs.json` de toda habilidade do agente, cruza com prioridades ativas + calendário de renovações, sinaliza lacunas, mostra os próximos movimentos. Saída: `reviews/{YYYY-MM-DD}.md`.
- `metrics-rollup` - pulso semanal cruzado entre métricas. Lê toda métrica monitorada, calcula a variação semana a semana, classifica conforme a direção, sinaliza anomalias abertas. Alimenta a revisão `weekly`. Saída: `rollups/{YYYY-MM-DD}.md`.

## Passos

1. Leio `config/context-ledger.json`. Preencho lacunas com UMA pergunta ordenada por modalidade.
2. Leio `context/operations-context.md`, prioridades ativas, ritmo operacional, contatos principais, postura com fornecedores, limites inegociáveis.
3. Ramifico conforme `period`:

   **Se `period = metrics-rollup`:**
   - Leio `config/metrics.json` para o registro de métricas.
   - Para cada métrica, leio os últimos 14 retratos de `metrics-daily.json`.
   - Calculo: valor desta semana, valor da semana passada, variação semana a semana, variação em %, classificação conforme a direção declarada (melhorou / estável / piorou), anoto qualquer anomalia aberta em `anomalies.json`.
   - Classifico primeiro pela maior variação (variação % absoluta), depois por prioridade (métricas ligadas às prioridades ativas primeiro).
   - Escrevo o resumo como tabela escaneável + 2 a 3 frases de comentário sobre os 3 maiores movimentos.

   **Se `period = weekly`:**
   - Opcionalmente leio o `rollups/{YYYY-MM-DD}.md` mais recente se existir, se não, considero sugerir rodar `metrics-rollup` antes da revisão, sem bloquear.
   - Vasculho `outputs.json` por toda entrada com `updatedAt` nos últimos 7 dias. Agrupo por habilidade / domínio.
   - Leio `renewals/calendar.md`, sinalizo qualquer coisa renovando nos próximos 30 dias.
   - Leio `bottlenecks.json` e `decisions.json` (últimos 30 dias).
   - Produzo a revisão:
     - **O que foi entregue** - por domínio (Planejamento / Pessoas / Financeiro / Fornecedores / Dados), em tópicos com caminhos.
     - **O que se moveu** - os 3 maiores movimentos de métricas do resumo, se disponível.
     - **O que está parado** - coisas iniciadas mas não tocadas há 3 semanas ou mais.
     - **Lacunas versus prioridades** - cada prioridade ativa → o que fizemos por ela essa semana → veredito honesto (no caminho certo / em risco / fora do caminho).
     - **Prazos próximos** - renovações nos próximos 30 dias, atualizações de investidores vencendo, reuniões do conselho.
     - **O único movimento** - a coisa mais útil a fazer essa semana.

4. Escrevo de forma atômica (`.tmp` → renomear) no caminho apropriado.
5. Adiciono a `outputs.json` com `{id, type, title, summary, path, status: "ready", createdAt, updatedAt, domain: "planning" ou "data"}`. Type = `"weekly-review"` ou `"metrics-rollup"`.
6. Resumo para você: o único movimento (semanal) ou os 3 maiores movimentos (resumo de métricas).

## Saídas

- `reviews/{YYYY-MM-DD}.md` (semanal)
- `rollups/{YYYY-MM-DD}.md` (resumo de métricas)
- Adiciona a `outputs.json`.

## O que eu nunca faço

- Reivindicar avanço em uma prioridade que eu não consigo comprovar em `outputs.json`.
- Inventar movimento de métrica, se o dado estiver faltando, eu digo isso.
- Substituir o registro de decisões, se a revisão revelar um item com cara de decisão, sinalizo como candidato para `log-a-decision`, sem registrar como uma.
