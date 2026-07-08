---
name: conferir-minhas-vendas
title: "Conferir minhas vendas"
description: "Tenha um diagnóstico real de como está seu processo de vendas. Escolha o que você precisa: um resumo de segunda-feira em todas as frentes, uma síntese entre calls com ajustes no playbook, uma leitura de padrões de ganhos e perdas, uma análise profunda de uma call de descoberta específica, ou uma foto do pipeline com o estágio que mais vaza. Cada leitura termina com uma ação concreta, não com um dashboard."
version: 1
category: Vendas
featured: yes
image: handshake
integrations: [hubspot, salesforce, attio, gong, fireflies]
---


# Conferir Minhas Vendas

Uma skill, cinco frentes de análise. O parâmetro `subject` escolhe o escopo. Disciplina compartilhada de "próximos passos acima de dashboards".

## Parâmetro: `subject`

- `sales-health` - resumo de segunda-feira. Agrega toda saída de skill da última semana a partir de `outputs.json`. Agrupa por frente (Playbook, Prospecção, Inbound, Reuniões, CRM, Retenção). Sinaliza trabalho travado + acompanhamentos perdidos + atrasos.
- `call-insights` - síntese entre N calls: linguagem de dor, frequência de objeções, padrões de ganho/perda, com sugestões concretas de ajuste no playbook.
- `win-loss` - agrupa negócios ganhos e perdidos por motivo. Encontra 3 padrões recorrentes. Propõe ajustes no playbook (afinar o cliente ideal, adicionar entradas ao manual de objeções, ajustar preços).
- `discovery-call` - análise profunda de uma call: proporção de fala (meta 40% representante / 60% prospect), pontuação de dor, lacunas de qualificação vs o framework do playbook, riscos / oportunidades, rascunho de acompanhamento.
- `pipeline` - foto por estágio + receita anual + velocidade dos negócios + transição que mais vaza. Ancora o forecast semanal.

Se você pedir usando linguagem simples ("revisão de vendas", "analise minhas calls", "ganhos e perdas", "como foi aquela call", "conferência de pipeline"), eu deduzo o assunto. Senão, faço UMA pergunta nomeando as 5 opções.

## Quando usar

- Gatilhos explícitos na descrição.
- Implícito: `capture-my-call-notes` encadeia em `check-my-sales subject=discovery-call` para completar o ciclo pós-call. A rotina semanal "revisão de vendas de segunda" dispara `subject=sales-health`. `run-my-forecast` encadeia em `subject=pipeline` para a camada narrativa.

## Conexões que eu preciso

Eu executo trabalho externo pelo Composio. Antes desta skill rodar eu verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Reuniões** - puxar as transcrições de call para `discovery-call` e `call-insights`. Obrigatório para esses assuntos.
- **CRM** - puxar negócios ganhos/perdidos para `win-loss` e a foto de negócios abertos para `pipeline`. Obrigatório para esses assuntos.

Se nenhuma das categorias obrigatórias estiver conectada eu paro e peço para você conectar seu gravador de calls primeiro (Gong ou Fireflies), já que a maioria dos pedidos cai em assuntos baseados em calls.

## Informações que eu preciso

Eu leio seu contexto de vendas primeiro. Para cada campo obrigatório que estiver faltando eu faço UMA pergunta em linguagem simples (melhor formato: app conectado > arquivo > URL > texto colado) e espero.

- **Seu playbook de vendas** - Obrigatório. Por que eu preciso: o framework de qualificação, os estágios dos negócios e o manual de objeções fundamentam toda leitura. Se estiver faltando eu pergunto: "Ainda não tenho seu playbook, quer que eu redija um agora? Leva uns 5 minutos."
- **Gravador de calls conectado** - Obrigatório para `discovery-call` e `call-insights`. Por que eu preciso: leio a transcrição para pontuar a proporção de fala e trazer à tona a linguagem de dor. Se estiver faltando eu pergunto: "Conecte o Gong ou o Fireflies, ou cole a transcrição aqui."
- **CRM conectado** - Obrigatório para `win-loss` e `pipeline`. Por que eu preciso: puxo negócios fechados e fotos de estágio. Se estiver faltando eu pergunto: "Conecte seu CRM (HubSpot, Salesforce, Attio, Pipedrive ou Close), ou cole uma lista recente de estágios."

## Passos

1. **Ler o registro + o playbook.** Reúno os campos obrigatórios que faltam (UMA pergunta cada, começando pelo melhor formato). Escrevo atomicamente.

2. **Ramificar pelo assunto.**
   - `sales-health`: leio `outputs.json` dos últimos 7 dias (ou a janela que você especificar). Agrupo por frente. Por frente, mostro (a) o que foi entregue (títulos + caminhos), (b) o que está parado (itens `status: draft` há mais de 7 dias + sem `updatedAt` há mais de 3 semanas), (c) o próximo passo mais útil. Termino com os **top 3 movimentos da semana** entre frentes.
   - `call-insights`: leio `calls/*/notes-*.md` + `analysis-*.md` das últimas N calls (padrão 10, você pode mudar). Extraio: top 5 frases de dor (literais, contadas por frequência), top 5 objeções (contadas por frequência + melhor reformulação atual), temas de ganho/perda (o que engatou vs o que travou). Termino com sugestões concretas de ajuste no playbook: "adicione a dor X ao perfil de cliente ideal", "reformule a entrada Y do manual de objeções", "aperte o pilar de qualificação Z". Salvo em `call-insights/{YYYY-MM-DD}.md`.
   - `win-loss`: puxo negócios ganhos e perdidos do CRM (recomendado pelo menos 5 de cada; aviso se tiver menos). Agrupo por motivo. Encontro 3 padrões. Proponho ajustes no playbook. Salvo em `analyses/win-loss-{YYYY-MM-DD}.md`.
   - `discovery-call`: leio o `calls/{slug}/notes-*.md` mais recente (ou peço o id da call). Calculo a proporção de fala a partir da transcrição se disponível (rótulos de quem fala), senão estimo pela densidade das notas. Pontuo cada pilar de qualificação de 0 a 3 vs o framework do playbook. Mostro riscos (objeções sem resposta, stakeholder faltando, pilar travado) + oportunidades (sinal de expansão, champion forte, pressão de prazo). Termino com um rascunho de acompanhamento (encaminho para `write-my-outreach stage=followup` ou redijo direto). Salvo em `calls/{slug}/analysis-{YYYY-MM-DD}.md`.
   - `pipeline`: puxo a foto de negócios abertos do CRM. Por estágio: quantidade, receita anual, tempo médio no estágio, conversão de um estágio para o próximo. Sinalizo a transição que mais vaza. Comparo com a foto da semana passada se `pipeline-reports/*.md` existir. Salvo em `analyses/pipeline-{YYYY-MM-DD}.md` + espelho a tabela bruta em `pipeline-reports/{YYYY-WNN}.md`.

3. **Escrever atomicamente.** Cada assunto escreve no caminho acima com `*.tmp` → renomear.

4. **Adicionar ao `outputs.json`**, lendo, mesclando e escrevendo atomicamente: `{ id (uuid v4), type: "analysis" (ou "call-analysis" para discovery-call, "pipeline-report" para pipeline), title: "{Assunto} - {data}", summary: "<principal achado + principal movimento>", path, status: "ready", createdAt, updatedAt, domain: "<playbook (sales-health, win-loss, call-insights) | meetings (discovery-call) | crm (pipeline)>" }`.

5. **Resumir para você.** Um parágrafo: o achado mais importante + o próximo passo mais importante. Caminho para o material completo.

## O que eu nunca faço

- Inventar números de pipeline, motivos de ganho/perda, padrões de call-insights. Todo achado se liga a uma linha real ou trecho de transcrição.
- Entregar um resumo genérico, toda análise termina com um próximo passo concreto ligado a uma skill existente.
- Consolidar em janelas de tempo curtas demais para significar algo (`win-loss` com menos de 3 de cada lado; `call-insights` com menos de 5 calls), mostro um aviso em vez disso.

## Saídas

- `sales-health`, `win-loss`, `pipeline` → `analyses/{subject}-{date}.md`
- `call-insights` → `call-insights/{YYYY-MM-DD}.md`
- `discovery-call` → `calls/{slug}/analysis-{YYYY-MM-DD}.md`
- `pipeline` também espelha a tabela em `pipeline-reports/{YYYY-WNN}.md`
- Adiciona ao `outputs.json`.
