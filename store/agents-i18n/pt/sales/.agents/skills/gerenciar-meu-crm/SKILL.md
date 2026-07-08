---
name: gerenciar-meu-crm
title: "Gerenciar meu CRM"
description: "Executo a ação de CRM que você precisar: uma limpeza que detecta duplicados e incompatibilidades de estágio sem alterar nada, uma consulta somente leitura em linguagem natural, um roteamento que atribui VERDE, nutre AMARELO e descarta VERMELHO, ou uma tarefa de acompanhamento enviada para sua ferramenta de tarefas. Eu nunca altero nada sem sua aprovação linha por linha."
version: 1
category: Vendas
featured: no
image: handshake
integrations: [hubspot, salesforce, attio, pipedrive, notion, linear]
---


# Gerenciar Meu CRM

Uma skill, quatro ações de CRM. O parâmetro `action` escolhe a operação. Disciplina compartilhada de "ler primeiro, só altero com aprovação".

## Parâmetro: `action`

- `clean` - varredura de higiene: duplicados, campos obrigatórios faltando, incompatibilidades de estágio (ex.: negócio no Estágio 3, sem champion registrado). Escrevo a lista de diferenças. Só altero com aprovação explícita linha por linha.
- `query` - pergunta em linguagem natural → consulta somente leitura no CRM → resposta + a consulta rodada. "Quantos negócios no Estágio 2?" / "Mostre os negócios fechando este mês." / "Quem é o dono da conta Acme?"
- `route` - leio as pontuações de lead mais recentes, aplico a política de roteamento do playbook (padrão: VERDE → atribui um dono, AMARELO → fila de nutrição, VERMELHO → descarta). Escrevo as decisões; só altero os campos de dono do CRM com aprovação.
- `queue-followup` - envia uma tarefa para a ferramenta de tarefas conectada (estilo Linear / Notion / Asana). Conteúdo da tarefa: quem, o quê, quando, negócio / lead vinculado.

Se você pedir de forma implícita ("faça uma limpeza no CRM", "como está meu pipeline", "roteie os leads", "coloque um acompanhamento na fila"), eu deduzo a ação. Senão, faço UMA pergunta nomeando as 4 opções.

## Quando usar

- Gatilhos explícitos na descrição.
- Implícito: depois que `score-my-pipeline subject=lead` terminar, encadeio `action=route`. Depois de `check-my-sales subject=discovery-call` ou `write-my-outreach stage=followup`, encadeio `action=queue-followup` para o próximo passo.

## Conexões que eu preciso

Eu executo trabalho externo pelo Composio. Antes desta skill rodar eu verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **CRM** - ler contatos, negócios e estágios; só altero com aprovação linha por linha. Obrigatório para toda ação.
- **Ferramentas de tarefas** - enviar uma tarefa para o Linear, Notion, ou estilo Asana. Obrigatório para `queue-followup`.

Se seu CRM não estiver conectado eu paro e peço para você conectar o HubSpot, Salesforce, Attio, Pipedrive, ou Close na aba Integrações.

## Informações que eu preciso

Eu leio seu contexto de vendas primeiro. Para cada campo obrigatório que estiver faltando eu faço UMA pergunta em linguagem simples (melhor formato: app conectado > arquivo > URL > texto colado) e espero.

- **CRM conectado** - Obrigatório para toda ação. Por que eu preciso: toda linha precisa citar um registro real. Se estiver faltando eu pergunto: "Com qual CRM devo trabalhar, HubSpot, Salesforce, Attio, Pipedrive ou Close? Conecte na aba Integrações."
- **Seus estágios de negócio e o mapa de donos** - Obrigatório para `clean` e `route`. Por que eu preciso: detecto incompatibilidades de estágio e atribuo leads VERDE ao dono certo. Se estiver faltando eu pergunto: "Me explique seus estágios de negócio e quem é dono de qual segmento."
- **Seu playbook de vendas** - Obrigatório para `clean` e `route`. Por que eu preciso: os critérios de saída de estágio orientam a detecção de incompatibilidades e seu perfil de cliente ideal fundamenta o descarte VERMELHO. Se estiver faltando eu pergunto: "Ainda não tenho seu playbook, quer que eu redija um agora?"
- **Política de roteamento** - Opcional. Por que eu preciso: o padrão que eu uso é "VERDE para o dono, AMARELO para nutrição, VERMELHO descartado." Se você não tiver uma regra diferente, eu sigo em frente com esse padrão.
- **Ferramenta de tarefas conectada** - Obrigatório para `queue-followup`. Por que eu preciso: envio tarefas para um lugar que você realmente vai ver. Se estiver faltando eu pergunto: "Onde os acompanhamentos devem cair, Linear, Notion, Asana?"

## Passos

1. **Ler o registro + o playbook.** Reúno os campos obrigatórios que faltam (UMA pergunta cada, começando pelo melhor formato). Escrevo atomicamente.

2. **Descobrir o slug do CRM via Composio.** `composio search crm` → escolho o conectado. Nenhum conectado → nomeio a categoria a conectar e paro.

3. **Ramificar pela ação.**
   - `clean`:
     1. Puxo a lista completa de contatos + negócios via ferramentas de leitura do CRM.
     2. Detecto problemas:
        - **Duplicados** - contatos com mesmo domínio de e-mail + sobrenome + primeiro nome parecido; negócios da mesma conta + valor sobreposto.
        - **Campos obrigatórios faltando** - conforme o framework de qualificação do playbook (ex.: negócio no Estágio 3, sem champion registrado).
        - **Incompatibilidades de estágio** - negócio no Estágio N mas os critérios de saída do Estágio N-1 não foram cumpridos; negócios parados (sem atividade há mais de 30 dias, em estágios ativos).
     3. Escrevo a lista de diferenças em `crm-reports/clean-{YYYY-MM-DD}.md` - uma seção por tipo de problema, cada linha com a **alteração recomendada** + comando de aprovação (por linha, não em bloco). Nada é alterado ainda.
     4. Mostro os 10 principais problemas direto no chat + o caminho. Espero aprovação explícita linha por linha antes de executar as alterações via `composio <crm> <action>`.
   - `query`:
     1. Interpreto a pergunta como uma consulta estruturada (entidade + filtros + agrupamento).
     2. Rodo a consulta somente leitura no CRM conectado.
     3. Retorno a resposta + a consulta rodada (você pode ajustar). Salvo em `crm-reports/query-{YYYY-MM-DD}.md` com a pergunta, a consulta, a tabela de resposta. Nada é alterado.
   - `route`:
     1. Leio o `scores/lead-*.md` mais recente (ou rodo `score-my-pipeline subject=lead` primeiro se estiver desatualizado) e `leads.json`.
     2. Aplico a política de roteamento:
        - **VERDE** → atribuo o dono padrão de `ownerMap` (pergunto uma vez se estiver faltando).
        - **AMARELO** → fila de nutrição (mostro depois para `write-my-outreach stage=cold-email`).
        - **VERMELHO** → descarto (com o desqualificador citado).
     3. Escrevo as decisões em `crm-reports/route-{YYYY-MM-DD}.md`. Mostro os 10 principais direto no chat + as contagens por grupo. Espero aprovação antes de alterar os campos de dono no CRM.
   - `queue-followup`:
     1. Interpreto o pedido: quem, o quê, quando. Puxo a referência do negócio / lead se nomeado.
     2. Descubro a ferramenta de tarefas via `composio search task`. Nenhuma conectada → pergunto uma vez qual usar.
     3. Envio a tarefa via o slug de criação de tarefa da ferramenta. Capturo a URL da tarefa.
     4. Registro em `tasks/{YYYY-MM-DD}.md` (adiciono, é um registro contínuo, não um arquivo por tarefa).

4. **Adiciono ao `outputs.json`** - leio, mesclo e escrevo atomicamente: `{ id (uuid v4), type: "crm-sweep" (clean) | "crm-query" (query) | "routing-decision" (route) | "task-queued" (queue-followup), title, summary, path, status: "ready" (ou "draft" para clean / route até as alterações serem aprovadas), createdAt, updatedAt, domain: "crm" }`.

5. **Resumir para você.** Principal achado + próxima aprovação obrigatória (clean / route) ou confirmação (query / queue-followup). Nunca altero nada sem aprovação explícita linha por linha.

## O que eu nunca faço

- Alterar registros do CRM (mudança de estágio, reatribuição de dono, exclusão de contato) sem aprovação explícita linha por linha.
- Inventar um campo ou negócio do CRM, toda linha cita um ID de registro real do CRM conectado.
- Consultar fora do escopo somente leitura que você autorizou.
- Enviar tarefa para uma ferramenta não conectada, sempre descubro via Composio.

## Saídas

- `clean` → `crm-reports/clean-{YYYY-MM-DD}.md`
- `query` → `crm-reports/query-{YYYY-MM-DD}.md`
- `route` → `crm-reports/route-{YYYY-MM-DD}.md`
- `queue-followup` → adiciona a `tasks/{YYYY-MM-DD}.md`
- Adiciona ao `outputs.json`.
