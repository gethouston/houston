---
name: analisar-minhas-ligacoes-de-vendas
title: "Analisar minhas ligações de vendas"
description: "Extraio as palavras exatas que seus clientes usam nas gravações das suas ligações de vendas. Puxo frases de dor textuais, padrões de objeções e sinais de posicionamento das transcrições do Gong ou Fireflies, classificados por frequência. Esta é a melhor fonte para títulos, textos de anúncios e landing pages que soem como o seu comprador."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [gong, fireflies, fathom]
---


# Analisar Minhas Ligações de Vendas

Extraio as palavras exatas que seus clientes usam nas gravações das suas ligações de vendas. Eu puxo frases de dor literais, padrões de objeções e sinais de posicionamento. É o input de pesquisa de maior alavancagem que tenho, a linguagem literal do cliente supera qualquer paráfrase de marketing.

## Quando usar

- "analisar minhas ligações de vendas" / "o que os clientes estão dizendo" / "extrair objeções das minhas ligações".
- "puxar sinais de posicionamento das ligações da semana passada".
- Chamado implicitamente por `set-up-my-marketing-info` (ao buscar citações literais) e `profile-my-customer` (ao construir seções de dores / objeções).

## Conexões que preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar, verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações e paro.

- **Notas de reunião (Gong, Fireflies, Fathom, Circleback)** - puxar transcrições recentes de ligações. Obrigatório (ou você cola as transcrições diretamente).

Se nenhum app de notas de reunião estiver conectado e você não puder colar transcrições, eu paro e peço para você conectar o Gong, o Fireflies ou o Fathom na aba Integrações.

## Informações que preciso

Eu leio primeiro o seu contexto de marketing. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > upload de arquivo > URL > colar) e espero.

- **Seu posicionamento** - Obrigatório. Por que preciso: ancoro a análise nas suas afirmações atuais para sinalizar onde os clientes as contradizem. Se estiver faltando, eu pergunto: "Quer que eu redija seu posicionamento primeiro? É uma ação, leva uns cinco minutos."
- **Quais ligações analisar** - Obrigatório. Por que preciso: eu não vou puxar todo o seu histórico às cegas. Se estiver faltando, eu pergunto: "Qual lote devo puxar, as últimas cinco ligações, as últimas dez, um intervalo de datas, ou uma conta específica?"
- **Transcrições coladas** - Obrigatório apenas se nenhum app de notas de reunião estiver conectado. Se estiver faltando, eu pergunto: "Cole de uma a três gravações de ligações ou as transcrições que você quer que eu leia."

## Passos

1. **Ler o documento de posicionamento** (arquivo próprio): `context/marketing-context.md`. Ancorar a análise, procurar citações que apoiem, atualizem ou contradigam as afirmações atuais.

2. **Escolher a fonte - fazer UMA pergunta direta se não for óbvio, com dica de modalidade:**
   - "Posso puxar do seu app de notas de reunião conectado, ou você pode colar de 1 a 3 transcrições. Qual prefere?"
   - Conectado: rodar `composio search meeting-notes`; listar ligações recentes; perguntar ao usuário qual lote (últimas 5, últimas 10, intervalo de datas, conta específica).
   - Colado: usar a cola literalmente.

3. **Se conectado, buscar.** Executar o slug de listar-ligações-recentes da ferramenta descoberta, depois o slug de listar-transcrição por ligação. Capturar: data da ligação, participantes, duração, transcrição completa.

4. **Extrair por ligação.** Para cada transcrição:
   - **Linguagem de dor literal** - 3 a 5 citações diretas onde o cliente descreve o problema. Preservar palavra por palavra.
   - **Linguagem de posicionamento literal** - como eles descrevem a categoria, nosso produto, concorrentes. Preservar.
   - **Objeções levantadas** - a objeção real, o contexto, se foi tratada na ligação.
   - **Sinais de compra** - menções de orçamento, menções de prazo, menções de stakeholders.
   - **Surpresas** - qualquer coisa que contradiga o documento de posicionamento atual. Ouro.

5. **Sintetizar em todo o lote.** Consolidar:
   - Padrões de dor - qual linguagem de dor se repete, com frequência.
   - Padrões de objeção - as 3 principais objeções por frequência.
   - Linguagem da categoria - palavras que os clientes realmente usam (versus o que usamos no site).
   - Diferenças em relação ao documento de posicionamento - o que adicionar / mudar / remover em `context/marketing-context.md`.

6. **Estruturar o artefato (markdown, ~400-700 palavras).** Para um lote, escrever `call-insights/{YYYY-MM-DD}-batch.md`. Para um aprofundamento único em uma ligação, escrever `call-insights/{call-slug}.md`. Estrutura:

   1. **Escopo** - N ligações, intervalo de datas, contas.
   2. **Principais dores literais** - citadas, com autor da fala + data da ligação.
   3. **Principal linguagem de posicionamento literal** - como os clientes descrevem a categoria + nós + concorrentes.
   4. **Top 3 objeções** - literais + contexto + tratada/não tratada.
   5. **Sinais de compra identificados** - lista.
   6. **Surpresas + diferenças versus o documento de posicionamento** - recomendações de atualização em tópicos.
   7. **Lista de repasse** - quais agentes recebem qual insight. Exemplo: `[lifecycle-email] Usar a frase "{quote}" no assunto do e-mail de reativação.`

7. **Nunca inventar.** Toda citação está vinculada a transcrição + autor da fala + timestamp. Se não foi dito, não arredonde nem resuma em uma citação. Se as transcrições forem finas demais, diga isso e pare.

8. **Escrever atomicamente** - `{path}.tmp` e depois renomear.

9. **Adicionar ao `outputs.json`.** Ler-mesclar-escrever atomicamente:

   ```json
   {
     "id": "<uuid v4>",
     "type": "call-insight",
     "title": "<Lote de insights de ligações YYYY-MM-DD>" | "<Ligação com {account}>",
     "summary": "<2-3 frases - principal padrão de dor + principal objeção + diferença em relação ao posicionamento>",
     "path": "call-insights/<slug>.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

10. **Oferecer atualização do documento de posicionamento.** Se as diferenças forem relevantes, perguntar ao usuário: "Quer que eu atualize o documento de posicionamento com essas formas de falar dos clientes?" - se sim, rodar `set-up-my-marketing-info` no modo de atualização.

11. **Resumir para o usuário.** Um parágrafo: principal frase de dor, principal objeção, maior diferença de posicionamento, caminho para o artefato.

## Resultados

- `call-insights/{YYYY-MM-DD}-batch.md` ou `call-insights/{call-slug}.md`.
- Adiciona ao `outputs.json` com `type: "call-insight"`.
- Pode disparar uma execução de `set-up-my-marketing-info` (requer aprovação do usuário).
