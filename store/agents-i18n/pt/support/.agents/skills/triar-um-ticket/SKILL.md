---
name: triar-um-ticket
title: "Triar um ticket"
description: "Me passe um ticket novo e eu faço a triagem para você. Leio a mensagem, identifico do que se trata (bug, passo a passo, cobrança, pedido de funcionalidade), verifico se o cliente é VIP, atribuo uma prioridade com base nas suas regras de roteamento, e coloco na sua fila para que você saiba exatamente o que precisa de atenção e com que urgência."
version: 1
category: Suporte
featured: yes
image: headphone
integrations: [gmail, outlook, slack]
---


# Triar um ticket

## Quando usar
Uma nova mensagem chegou e ainda não existe uma entrada em `conversations.json` para a conversa, OU uma entrada existente precisa ser triada de novo porque o conteúdo mudou (por exemplo, uma dúvida de passo a passo virou relato de indisponibilidade). Para quem toca a empresa sozinho, a triagem é constante: cada resposta nova precisa desta skill rodando primeiro.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes de rodar esta skill, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu digo qual é a categoria, peço para você conectá-la na aba de Integrações, e paro.

- **Caixa de entrada** (Gmail / Outlook), para buscar a mensagem recebida e a conversa completa. Obrigatória.
- **Helpdesk de suporte** (Intercom / Zendesk / Help Scout), fonte alternativa se as mensagens de clientes chegam por lá. Obrigatória se você não usa Gmail / Outlook para suporte.
- **Mensagens** (Slack), fonte de DMs de clientes que você tria como tickets. Opcional.

Se nenhuma caixa de entrada ou helpdesk estiver conectado, eu paro e peço para você conectar aquele por onde seus clientes realmente falam com você.

## Informações que eu preciso

Eu leio o seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor forma: app conectado > envio de arquivo > URL > colar) e aguardo.

- **Categorias de roteamento**. Obrigatório. Por que preciso: classifico cada ticket recebido em uma delas. Se faltar, pergunto: "Quando um ticket chega, em quais categorias você o separa, bug, passo a passo, cobrança, algo mais?"
- **Faixas de tempo de resposta**. Obrigatório. Por que preciso: a atribuição de prioridade depende dos limites de cada faixa. Se faltar, pergunto: "Qual tempo de resposta você quer cumprir para os tickets mais urgentes, e o que é aceitável para o resto?"
- **Lista de VIPs**. Obrigatório. Por que preciso: VIPs têm piso de P1 independentemente do conteúdo. Se faltar, pergunto: "Quais 3 a 5 clientes devem sempre receber prioridade máxima?"
- **Receita mensal / plano de cada cliente**. Opcional. Por que preciso: me permite ponderar a prioridade pelo status de cliente pagante. Se você não tiver, eu sigo em frente com TBD e pondero apenas pelos sinais do conteúdo.

## Passos
0. **Ler `context/support-context.md`.** Se não existir, paro. Aviso você para rodar `set-up-my-support-info` primeiro. Leio as regras de roteamento + faixas de tempo de resposta + lista de VIPs do documento, nunca deixo fixo no código.
1. **Identificar a origem.** Você indica o canal ou a mensagem referenciada por um id externo. Uso `composio search <channel>` para encontrar o slug de busca correto (por exemplo, busca de thread no Gmail, busca de conversa no Intercom). NÃO deixo slugs de ferramentas fixos.
2. **Buscar a conversa completa** via Composio. Extraio assunto, todas as mensagens, email do remetente, ids externos das mensagens.
3. **Resolver o cliente.** Procuro em `customers.json` pelo email do remetente. Se não encontrar, crio uma nova entrada no índice (slug = parte local do email em kebab-case, desduplicada se necessário).
4. **Categorizar** o conteúdo com base nas categorias de roteamento em `context/support-context.md` (conjunto típico: `bug | how-to | feature | billing | account | security | other`). Sinais do conteúdo: mensagens de erro + stack traces indicam bug; "como faço para…" indica passo a passo; "vocês podem adicionar…" indica pedido de funcionalidade; palavras como "reembolso", "fatura", "cobrança" indicam cobrança.
5. **Atribuir prioridade (P1–P4)** usando os limites das faixas em `context/support-context.md`. Regras típicas de partida: receita mensal >= $500/mês → base P2; tag VIP → piso de P1. Escalo pelo conteúdo: "fora do ar", "não consigo entrar", "perda de dados", "produção" → sobe um nível (máximo P1). Rebaixo com "quando você tiver um tempo".
6. **Definir os campos de tempo de resposta** usando `domains.inbox.responseTimeTargets.firstResponseHours` (com fallback para a tabela de faixas no documento de contexto). `breached = false` inicialmente.
7. **Escrever atomicamente.** Faço upsert em `conversations.json`. Escrevo as mensagens completas em `conversations/{id}/thread.json`.
8. **Adicionar ao `outputs.json`** com `type: "triage"`, `domain: "inbox"`, título = `{customer}  -  {subject}`, resumo = categoria + prioridade, caminho.

## Saídas
- Escreve em `conversations.json` (upsert no índice)
- Escreve em `conversations/{id}/thread.json` (conversa completa)
- Escreve em `customers.json` (nova linha de cliente se necessário)
- Adiciona ao `outputs.json` com `type: "triage"`, `domain: "inbox"`.
