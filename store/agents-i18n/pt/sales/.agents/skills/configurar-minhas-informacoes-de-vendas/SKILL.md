---
name: configurar-minhas-informacoes-de-vendas
title: "Configurar minhas informações de vendas"
description: "Me conte o básico sobre sua empresa, seu cliente ideal, sua postura de preços, os estágios dos seus negócios, e como você lida com objeções para que eu possa te dar uma ajuda melhor em vendas. Faço algumas perguntas rápidas e escrevo o playbook que todas as outras skills consultam primeiro. Você só precisa fazer isso uma vez, e eu mantenho tudo atualizado conforme as coisas mudam."
version: 1
category: Vendas
featured: yes
image: handshake
integrations: [googledocs, hubspot, salesforce, attio, pipedrive, notion]
---


# Configurar Minhas Informações de Vendas

Skill É DONA de `context/sales-context.md`. Nenhuma outra skill escreve nele.
Skill cria ou atualiza. A existência dele desbloqueia todas as outras skills do agente.

## Quando usar

- "escrever meu playbook de vendas" / "criar o playbook" / "vamos fazer o playbook".
- "atualizar o playbook" / "meu cliente ideal mudou, corrige o playbook" / "atualizar postura de preços".
- Chamada implicitamente por qualquer skill que precise do playbook se ele estiver faltando, só depois de confirmar com você.

## Conexões de que preciso

Eu rodo trabalho externo pelo Composio. Antes desta skill rodar, verifico se as categorias abaixo estão conectadas. Faltando, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **CRM** - puxar os estágios de negócios existentes e as contas fechadas com ganho para alimentar o playbook. Opcional.
- **Docs / notas** - ler um rascunho de playbook existente se você mantém um no Notion ou no Google Docs. Opcional.

Consigo rodar esta skill só com entrevista, então nenhuma conexão é obrigatória. Se você mencionar um CRM e ele não estiver conectado, vou pedir para você conectá-lo.

## Informações de que preciso

Leio seu contexto de vendas primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Nome da empresa, site e pitch de 30 segundos** - Obrigatório. Por que preciso: ancora a seção de visão geral da empresa e fundamenta o enquadramento de todas as outras seções. Se faltando, pergunto: "Qual é o nome da sua empresa, a URL da sua página inicial, e como você apresentaria ela em 30 segundos?"
- **Seu cliente ideal (setor, tamanho, cargos, dores, gatilhos)** - Obrigatório. Por que preciso: guia as seções de cliente ideal, comitê de compra e desqualificadores. Se faltando, pergunto: "Para quem você vende hoje, setor, tamanho da empresa, os cargos que realmente usam o produto, e o que dispara a decisão de compra?"
- **2 a 3 citações literais de clientes** - Obrigatório. Por que preciso: mantém a linguagem de dor e o manual de objeções nas palavras dos seus clientes, não em fala de marketing. Se faltando, pergunto: "Cole 2 ou 3 coisas que clientes reais disseram sobre a dor, sobre a categoria, ou uma objeção que levantaram."
- **Seu CRM e estágios de negócios** - Obrigatório. Por que preciso: alimenta a seção de estágios de negócios com os nomes que você realmente usa. Se faltando, pergunto: "Qual CRM você usa, HubSpot, Salesforce, Attio, Pipedrive ou Close, ou cole sua lista de estágios."
- **Framework de qualificação** - Obrigatório. Por que preciso: guia a seção de qualificação (MEDDPICC, BANT, ou o seu próprio). Se faltando, pergunto: "Você usa MEDDPICC, BANT, ou sua própria lista de qualificação?"
- **Postura de preços** - Opcional. Por que preciso: me permite escrever uma seção de preços de verdade em vez de deixar como TBD. Se você não tiver isso, sigo em frente com TBD.

## Passos

1. **Ler o registro + playbook existente.** Se `context/sales-context.md` existir, leio para que a execução seja uma atualização, não uma reescrita. Preservo o que o fundador já refinou; mudo só o que estiver desatualizado ou for novo.

2. **Garimpar chamadas recentes, se disponíveis.** Leio `calls/*/analysis-*.md` e `call-insights/*.md`. Puxo padrões de objeção e frases literais de dor direto para o manual, sem parafrasear.

3. **Insistir por linguagem literal do cliente.** Antes de redigir, peço ao fundador 2 a 3 citações literais de clientes (dor nomeada, frase sobre a categoria, objeção ouvida). Se `call-insights/` tiver entradas, garimpo essas primeiro. Sem paráfrase de fala de marketing.

4. **Redigir o playbook (~500-800 palavras, opinativo, concreto).** Estrutura, em ordem:

   1. **Visão geral da empresa** - um parágrafo: o que fazemos, para quem, o que torna isso importante de construir agora.
   2. **Cliente ideal** - setor, tamanho, região, estágio. Nomear **1 a 2 contas âncora** (fechada com ganho de verdade ou alvo).
   3. **Comitê de compra** - campeão (cargo + motivações), comprador econômico (cargo + o que ganha ele), bloqueador (quem mata negócios e por quê), influenciadores.
   4. **Desqualificadores** - 3 a 5 nãos definitivos. Ver X, desistir.
   5. **Framework de qualificação** - MEDDPICC / BANT / lista própria do fundador. Escrever as perguntas que este agente faz para pontuar cada pilar.
   6. **Postura de preços** - modelo, faixas (se divulgadas), política de desconto, termos mínimos viáveis, linha inegociável.
   7. **Estágios de negócios + critérios de saída** - o que move o negócio do Estágio N para o N+1. Concreto: "O Estágio 2 sai quando o campeão confirmou a dor E identificou o comprador econômico pelo nome."
   8. **Manual de objeções** - as 5 principais objeções + a melhor resposta atual do fundador. Preferir fraseado literal derivado de chamadas em vez de fala de marketing.
   9. **Top 3 concorrentes** - nomeados, uma linha "eles são fortes em X, nós ganhamos em Y" para cada um.
   10. **Objetivo principal da primeira call** - o único pedido em que toda call de descoberta deve pousar. Concreto: "O próximo passo é uma validação técnica com o líder de engenharia deles nos próximos 7 dias."

5. **Marcar as lacunas com honestidade.** Se uma seção estiver rasa (sem dados de chamada, sem conta âncora nomeada), escrever `TBD - {o que o fundador deveria trazer a seguir}`, não adivinhar. Nunca inventar.

6. **Escrever de forma atômica.** Escrever em `context/sales-context.md.tmp`, depois renomear para `context/sales-context.md`. Arquivo único. NÃO dentro de `.agents/`. NÃO dentro de `.houston/<agent>/`.

7. **Atualizar o registro.** Definir `universal.playbook = { present: true, path: "context/sales-context.md", lastUpdatedAt: <ISO> }` e quaisquer campos `universal.idealCustomer` / `domains.crm.dealStages` / `domains.meetings.qualificationFramework` que a entrevista capturou de novo. Leitura-mesclagem-escrita atômica de `config/context-ledger.json`.

8. **Adicionar ao `outputs.json`.** Ler o array existente, adicionar:

   ```json
   {
     "id": "<uuid v4>",
     "type": "playbook",
     "title": "Playbook de vendas atualizado",
     "summary": "<2-3 frases - o que mudou nesta passagem>",
     "path": "context/sales-context.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>",
     "domain": "playbook"
   }
   ```

   (O playbook em si é um arquivo vivo, mas cada edição substancial é indexada para que o fundador veja a atualização no painel.)

9. **Resumir para você.** Um parágrafo: o que você mudou, o que ainda está `TBD`, o próximo passo exato (por exemplo, "rodar `profile-my-buyer` para {segmento} para preencher a seção de comitê de compra"). Lembrar que todas as outras skills agora têm contexto.

## O que eu nunca faço

- Inventar perfil de cliente ideal, preços, concorrentes, ou objeções. Seções rasas recebem `TBD`, nunca adivinhadas.
- Sobrescrever seções refinadas em uma atualização, preservo o que o fundador aprimorou.
- Escrever o playbook em qualquer lugar além de `context/sales-context.md`.

## Saídas

- `context/sales-context.md` (na raiz do agente, documento vivo).
- Atualiza `config/context-ledger.json`.
- Adiciona ao `outputs.json` com `type: "playbook"`, `domain: "playbook"`.
