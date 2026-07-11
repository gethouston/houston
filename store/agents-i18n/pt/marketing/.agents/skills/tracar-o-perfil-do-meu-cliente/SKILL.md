---
name: tracar-o-perfil-do-meu-cliente
title: "Traçar o perfil do meu cliente"
description: "Construo um perfil detalhado do cliente que você está tentando conquistar. Puxo dados do seu CRM ou do que você colar, e te dou uma persona com jobs-to-be-done, dores ordenadas por prioridade, gatilhos de compra, padrões de objeções e contas âncora reais. Todo anúncio, landing page e e-mail que escrevo parte daqui."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [hubspot, salesforce, attio]
---


# Traçar o perfil do meu cliente

Modelo de origem: Gumloop "Market Segmentation: Buyer Persona Pain Point Report". Adaptado para o fundador solo que toca tudo sozinho.

## Quando usar

- "trace o perfil do nosso cliente ideal" / "monte uma persona para {segment}" / "me ajude a acertar a persona do comprador para {role}".
- "estamos subindo de mercado, refaça a persona" / "a persona de PME mudou, atualize".
- "monte uma persona a partir das contas fechadas e ganhas" / "puxe do meu CRM, não de achismo" / "quem está realmente comprando isso, olhe as vendas fechadas".
- Chamada implicitamente quando outra skill (ex.: `plan-a-campaign`, `set-up-my-marketing-info`) precisa de mais profundidade de persona do que `config/ideal-customer.json` oferece.

## Conexões que eu preciso

Faço o trabalho externo pelo Composio. Antes de rodar esta skill, verifico se as categorias abaixo estão conectadas. Se faltar alguma, digo qual é a categoria, peço que você conecte pela aba de Integrações e paro.

- **CRM (HubSpot, Salesforce, Attio)**: puxo as principais contas ganhas e perdidas para a persona se basear em quem compra de verdade. Obrigatório se você quiser que eu deduza a persona, opcional se preferir colar.
- **Notas de reunião (Gong, Fireflies, Circleback)**: dores, objeções e gatilhos com as palavras exatas do cliente. Opcional, mas eleva muito a qualidade da persona.
- **Busca e raspagem na web (Exa, Perplexity, Firecrawl)**: preencho definições de cargo, relatórios de mercado e fluxos de trabalho comuns. Opcional.

Se você quiser uma persona baseada no CRM e nenhum CRM estiver conectado, paro e peço que você conecte HubSpot, Salesforce ou Attio (ou cole as principais contas).

## Informações que eu preciso

Leio seu contexto de marketing primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Seu posicionamento**: obrigatório. Por que preciso: trabalho de persona sem uma âncora de posicionamento é trabalho jogado fora. Se faltar, pergunto: "Quer que eu rascunhe seu posicionamento primeiro? É uma skill só, leva uns cinco minutos."
- **O segmento a perfilar**: obrigatório. Por que preciso: uma persona por rodada, não quero construir a errada. Se faltar, pergunto: "Qual segmento vamos perfilar, seu cliente ideal principal ou um novo? Uma descrição curta serve, ou me aponte para o seu CRM."
- **Principais contas para eu aprender**: obrigatório. Por que preciso: não vou inventar dados demográficos. Se faltar, pergunto: "Conecte seu CRM para eu puxar sua lista de vendas fechadas, ou cole cinco contas (ganhas ou alvo) das quais você quer que eu aprenda."

## Passos

1. **Ler o doc de posicionamento** (arquivo próprio, já que isto é HoM): `context/marketing-context.md`. Se estiver faltando, rodar `set-up-my-marketing-info` primeiro; trabalho de persona sem âncora de posicionamento é trabalho jogado fora.

2. **Ler a config.** `config/ideal-customer.json`, `config/company.json`. Se a config de cliente ideal estiver rasa e o usuário não tiver nomeado o segmento, faço UMA pergunta direcionada: "Qual segmento vamos perfilar, seu cliente ideal principal ou um novo?" (Melhor modalidade: colar uma linha, ou apontar para o CRM conectado via Composio para eu deduzir a partir das principais contas.)

3. **Reunir evidências.** Ordem de prioridade:
   - `call-insights/` existentes na raiz deste agente: a linguagem textual do cliente vale ouro.
   - CRM conectado via `composio search crm`: principais contas ganhas e perdidas que batem com o segmento.
   - App de notas de reunião conectado via `composio search meeting-notes`.
   - Pesquisa na web via `composio search web-search` ou `composio search research`: relatórios de mercado, definições de cargo, fluxos de trabalho comuns.
   - Notas coladas pelo fundador.

4. **Rascunhar a persona (markdown, ~400-600 palavras).** Estrutura:

   1. **Nome do segmento + resumo de uma linha** (ex.: "Líderes de RevOps em SaaS B2B Série B de 50-200 pessoas").
   2. **Dados demográficos / firmográficos**: setor, tamanho, estágio, geografia, cargo, senioridade, a quem reporta.
   3. **Jobs-to-be-done**: 2-4 trabalhos para os quais contratam um produto como o nosso. Linguagem textual sempre que possível.
   4. **Dores**: ordenadas por intensidade + frequência. Cito a fonte (citação de ligação, motivo de perda no CRM, relatório de pesquisa).
   5. **Gatilhos**: padrões de sinal que tornam a persona um comprador ativo agora (contratando para o cargo, trocando de ferramenta, evento de captação, prazo de conformidade).
   6. **Contas âncora**: 3-5 empresas reais que se encaixam, idealmente 1-2 já clientes. Nomeio cada uma.
   7. **Padrões de objeção**: as 3 principais objeções que esta persona levanta, com a melhor resposta de uma linha para cada.
   8. **Processo de compra**: quem inicia, quem trava, quem assina, duração típica do ciclo, tamanho típico do comitê.
   9. **Onde eles circulam**: comunidades, newsletters, podcasts, conferências; acionável para o calendário social + jogadas de comunidade.
   10. **Ganchos de copy**: 3-5 linhas curtas que espelham a linguagem desta persona. Reutilizadas por conteúdo, e-mail de ciclo de vida e rascunhos para redes sociais.

5. **Marcar UNKNOWN, não adivinhar.** Toda seção com evidência insuficiente ganha a nota `UNKNOWN  -  {what would resolve it}`. Sem dados demográficos inventados.

6. **Atualizar `config/ideal-customer.json` se a persona afinar o cliente ideal padrão.** Gravação atômica. Pergunto ao usuário antes de sobrescrever, a menos que ele tenha dito "atualize o cliente ideal".

7. **Gravar atomicamente** em `personas/{segment-slug}.md`: gravo `{path}.tmp` e depois renomeio.

8. **Anexar a `outputs.json`.** Leio o array existente, anexo a nova entrada, gravo atomicamente:

   ```json
   {
     "id": "<uuid v4>",
     "type": "persona",
     "title": "<Segment name>",
     "summary": "<2-3 sentences  -  who they are, top pain, top trigger>",
     "path": "personas/<slug>.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

9. **Resumir para o usuário.** Um parágrafo: o segmento em uma linha, principal dor + principal gatilho, a maior lacuna da persona (o que pesquisar em seguida), caminho do artefato.

## Saídas

- `personas/{segment-slug}.md`
- Anexa a `outputs.json` com `type: "persona"`.
- Pode atualizar `config/ideal-customer.json` (com aprovação do usuário).
