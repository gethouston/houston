---
name: minerar-meus-tickets
title: "Minerar meus tickets"
description: "Eu passo pelos seus tickets recentes e extraio o que os clientes estão realmente dizendo. Agrupo as reclamações literais, os pedidos de funcionalidade, os pontos de fricção onde sua mensagem não bate com a realidade, e as frases que valem a pena roubar para a sua landing page. O melhor insumo para sua próxima conversa de roadmap, ajuste de posicionamento, ou atualização para investidores."
version: 1
category: Suporte
featured: yes
image: headphone
integrations: [gmail]
---


# Minerar meus tickets

Diferente de `flag-a-signal signal=repeat-question`. Aquela skill produz candidatos a lacunas na KB (visão operacional). Esta produz um relatório estratégico de voz do cliente (visão de produto/posicionamento). Mesma fonte de dados, consumidor diferente.

## Quando usar

- "minere os últimos {N} tickets em busca de temas."
- "o que os clientes estão pedindo?"
- Antes de escrever o roadmap, uma atualização da landing page ou uma atualização para investidores.
- Pedidos pontuais de pesquisa estratégica.

## Conexões de que preciso

Eu executo trabalho externo pelo Composio. Antes de rodar esta skill, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu nomeio a categoria, peço para você conectá-la na aba de Integrações e paro.

- **Caixa de entrada** (Gmail), fonte das conversas com clientes quando `conversations.json` não cobre a janela. Opcional se os dados locais estiverem atualizados.
- **Central de atendimento** (Intercom / Zendesk / Help Scout), fonte alternativa de tickets. Opcional.

Se nenhuma das duas estiver conectada e o índice local de conversas estiver ralo, eu paro e peço para você conectar sua caixa de entrada ou central de atendimento para que eu tenha sinal suficiente.

## Informações de que preciso

Eu leio seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Posicionamento atual**, Obrigatório. Por que preciso disso: eu identifico fricção comparando a linguagem real dos clientes com o que você afirma. Se faltar, eu pergunto: "Como você descreve o que o produto faz hoje, compartilha a URL da sua homepage ou um parágrafo?"
- **Janela de tempo**, Obrigatório. Por que preciso disso: 30 dias é o padrão, mas eu amplio ou estreito se você quiser. Se faltar, eu pergunto: "Até onde devo olhar, últimos 30 dias, último trimestre, desde o lançamento?"
- **Filtro de segmento**, Opcional. Por que preciso disso: me permite agrupar por tipo de cliente em vez de misturar tudo. Se você não tiver, eu sigo com TBD e apresento clusters mistos.

## Passos

1. **Ler `context/support-context.md`.** Para o posicionamento atual + lista VIP. Se estiver faltando, rodar `set-up-my-support-info` primeiro.

2. **Definir a janela.** Padrão: últimos 30 dias. Pergunto se você quiser uma janela diferente.

3. **Ler os dados de conversas.**
   - `conversations.json`, filtrar para a janela.
   - Para cada conversa, ler `conversations/{id}/thread.json` para o conteúdo real das mensagens. Priorizar as mensagens do próprio cliente, não as suas respostas.
   - Pular mensagens com cara de bot ou que obviamente não são sinal.

4. **Ler o sinal da central de ajuda.**
   - `requests.json`, pedidos de funcionalidade na janela, com atribuição.
   - `patterns.json`, temas de perguntas repetidas já detectados.
   - Usar esses dados para validar os clusters e atribuir os pedidos.

5. **Extrair o sinal.**
   - **Dores (top 5):** agrupar frases literais de reclamação. Classificar por frequência. Para cada uma, manter 2-3 citações literais (identificadores redigidos).
   - **Pedidos de funcionalidade (top 5):** agrupar os pedidos. Classificar pelo número de clientes distintos pedindo (não pelo total de menções). Anotar quais VIPs estão em cada cluster.
   - **Frases de fricção:** frases que contradizem o posicionamento atual (por exemplo, o posicionamento afirma "fácil de configurar" mas 5 clientes descreveram a configuração como "confusa", sinalize isso).
   - **Citações dignas de posicionamento:** 2-3 frases literais boas para a copy da landing page, com atribuição por tipo de cliente.
   - **Padrões emergentes:** coisas que talvez tenham passado despercebidas, por exemplo, "3 clientes SMB diferentes perguntaram sobre a API esta semana."

6. **Rascunhar o relatório.** Markdown, ~500-700 palavras. Estrutura:

   ```markdown
   # Voz do Cliente, {window}

   **Janela:** {start} → {end}
   **Fonte:** {N} conversas, {N} pedidos de funcionalidade
   **Versão do documento de contexto:** baseado em `context/support-context.md` de {date}

   ## Top 5 dores (classificadas por frequência)

   1. **{Nome da dor}**, {count} ocorrências
      > "{citação literal 1}"
      > "{citação literal 2}"
      *Afeta: {segmentos ou VIPs}*

   2. … (repetir)

   ## Top 5 pedidos de funcionalidade (classificados por solicitantes distintos)

   1. **{Funcionalidade}**, {N} clientes distintos incluindo {VIP-se-houver}
      *Pedidos vinculados:* {caminhos em requests.json}
   2. …

   ## Fricção com o posicionamento atual

   {2-4 itens onde a linguagem dos tickets contradiz o
   posicionamento em context/support-context.md. Cada item: a afirmação, as
   citações que a contradizem, uma edição específica que poderíamos fazer.}

   ## Citações dignas de posicionamento

   - "{citação}", {tipo de cliente}
   - "{citação}", {tipo de cliente}
   - "{citação}", {tipo de cliente}

   ## Padrões emergentes

   {2-4 bullets sobre padrões que você talvez não tenha notado.}

   ## Próximos passos recomendados

   1. **Enviar para marketing/produto:** {citação ou dor específica}
   2. **Atualizar o posicionamento:** {um ponto de fricção que vale corrigir}
   3. **Construir/priorizar:** {um cluster de funcionalidade}
   ```

7. **Escrever em `voc/{YYYY-MM-DD}.md`** atomicamente.

8. **Adicionar a `outputs.json`** com `type: "voc-synthesis", domain: "quality"`, título = "voice-of-customer  -  {window}", resumo = maior dor + maior pedido, caminho, status `ready`.

9. **Resumir para mim.** Manchete: a maior dor + o maior pedido + 3 citações dignas de posicionamento coladas inline. Oferecer encadear em `review-my-support scope=weekly` para que a revisão da próxima segunda-feira traga o insight adiante.

## Saídas

- `voc/{YYYY-MM-DD}.md`
- Adiciona a `outputs.json` com `type: "voc-synthesis", domain: "quality"`.
