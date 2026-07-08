---
name: redigir-mensagem-de-ciclo-de-vida
title: "Redigir mensagem de ciclo de vida"
description: "Eu redijo as mensagens que conduzem seus clientes pelo ciclo de vida. Uma série de boas-vindas que leva novos cadastros até a primeira conquista em cinco contatos, uma sequência de renovação de 90/60/30 dias baseada no que a conta realmente alcançou, um lembrete pontual de expansão quando os dados de uso mostram que alguém está batendo no teto, ou uma mensagem de retenção quando um cliente sinaliza que quer sair. Cada rascunho referencia dados reais da conta e suas políticas reais, nada inventado."
version: 1
category: Suporte
featured: no
image: headphone
integrations: [hubspot, attio, stripe, mailchimp, customerio, loops]
---


# Redigir uma Mensagem de Ciclo de Vida

Uma skill, todo outreach de ciclo de vida de cliente que a sua operação de sucesso precisa. Ramifica por `type`.

## Quando usar

- **welcome-series**: "redija o onboarding para {segmento}" / "série de boas-vindas para novos cadastros" / "drip de ativação."
- **renewal**: "renovação chegando para {conta}" / "redija o 30/60/90 para {conta}" / "outreach pré-renovação."
- **expansion-nudge**: "eles estão prontos para o {plano}" / "redija um lembrete de expansão para {conta}" / "sinal de teto para {conta}."
- **churn-save**: "salve {conta}" / "redija uma mensagem de retenção para {cliente}" / "eles pediram para cancelar."

## Conexões de que preciso

Eu executo trabalho externo via Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Faltando alguma, eu nomeio a categoria, peço para você conectá-la na aba de Integrações, e paro.

- **Enviador de e-mail** (Loops / Customer.io / Mailchimp), para formatar a série de boas-vindas para a ferramenta de ciclo de vida de onde você realmente envia. Obrigatório para `welcome-series`.
- **CRM** (HubSpot / Attio), para puxar o registro da conta, o responsável e o histórico de planos para personalização. Obrigatório para `renewal` / `expansion-nudge` / `churn-save`.
- **Cobrança** (Stripe), para ler a receita mensal, o plano e a data de renovação, e assim ancorar o pedido em números reais. Obrigatório para `renewal` / `expansion-nudge`.

Se nenhuma das categorias obrigatórias estiver conectada, eu paro e peço para você conectar seu CRM primeiro.

## Informações de que preciso

Eu leio seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e aguardo.

- **Amostras de voz**, obrigatórias. Por que preciso: copy de ciclo de vida na voz errada é ignorada. Se estiver faltando, pergunto: "Quer que eu garimpe sua pasta de enviados para captar o tom, ou você pode me passar 3 a 5 dos seus e-mails recentes para clientes?"
- **Planos + preços**, obrigatórios. Por que preciso: para saber o que "upgrade" ou "downgrade" significa para essa conta. Se estiver faltando, pergunto: "Quais planos você vende e quanto custam, aproximadamente?"
- **Cadência de renovação**, obrigatória para `renewal`. Por que preciso: a sequência 30/60/90 é ancorada na sua janela de renovação. Se estiver faltando, pergunto: "As renovações são anuais, mensais, ou outra coisa? E quando termina o prazo dessa conta?"
- **Ofertas de retenção aprovadas**, obrigatórias para `churn-save`. Por que preciso: eu não vou inventar desconto nem crédito. Se estiver faltando, pergunto: "Quando alguém tenta cancelar, o que você pode realmente oferecer? Pausa, downgrade, reembolso, tempo de concierge?"
- **Marcos de ativação**, obrigatórios para `welcome-series`. Por que preciso: cada contato precisa de um evento "aha" real para empurrar o cliente na direção certa. Se estiver faltando, pergunto: "Qual é a primeira coisa que um novo cadastro precisa fazer para o produto fazer sentido? E o que vem depois?"

## Parâmetro: `type`

- `welcome-series`: sequência de 5 contatos nos dias 0 / 1 / 3 / 7 / 14 para novos cadastros em `{segment}`. Cada contato: assunto, preview, corpo, CTA, métrica de sucesso. Escreve `onboarding/{segment}.md`.
- `renewal`: sequência pré-renovação de 3 contatos (Dia-90 / Dia-60 / Dia-30) para `{account}`, ancorada na linha do tempo da conta. Cada contato: assunto, corpo, CTA, conquista específica para referenciar. Escreve `renewals/{account}-{YYYY-MM-DD}.md`.
- `expansion-nudge`: UM outreach para `{account}` ancorado em um sinal de teto específico (limiar de adoção de funcionalidade, mudança no tamanho do time, pedido recorrente). Escreve `expansions/{account}.md`.
- `churn-save`: UMA mensagem de retenção para `{account}` ancorada no sinal de risco exato de `churn-flags.json`, oferecendo uma opção genuína (pausa / downgrade / concierge / reembolso). Escreve `saves/{account}.md`.

## Passos

1. **Ler `config/context-ledger.json` e `config/voice.md`.** Preencher lacunas com uma pergunta direcionada.
2. **Ler `context/support-context.md`.** Faltando → parar e me avisar para rodar `set-up-my-support-info` primeiro.
3. **Ramificar por `type`:**
   - `welcome-series`: me perguntar `{segment}` se não foi dado, redigir 5 e-mails ancorados nos marcos de ativação do produto (checar `domains.email.journey` se estiver definido, senão me pedir para nomear os eventos de cadastro / ativação / aha).
     Formatar para o ESP conectado (Customer.io / Loops / Mailchimp / Kit via Composio). Incluir métricas de sucesso por contato.
   - `renewal`: encadear `look-up-a-customer view=timeline` para a conta, puxar conquistas, pedidos entregues, atritos. Redigir Dia-90 (recapitulação de valor), Dia-60 (oportunidade de expansão ou mecânica da renovação), Dia-30 (pedido direto + pauta). Cada referência ancorada no artefato de linha do tempo.
   - `expansion-nudge`: encadear `look-up-a-customer view=health` para encontrar o sinal de teto. Redigir um outreach curto e específico nomeando o sinal ("Notei que você adicionou 3 assentos, o plano {tier} eliminaria o limite por assento") e propor uma opção. Sem pressão de upsell; sem sinal real → parar e me avisar.
   - `churn-save`: encadear `look-up-a-customer view=churn-risk` para puxar o sinal exato. Reconhecer o risco com honestidade, nomear a dor específica, oferecer pausa / downgrade / concierge / reembolso, o que estiver na política em `context/support-context.md`. Nunca inventar desconto não pré-aprovado.
4. **Escrever o artefato** de forma atômica no caminho deste `type`.
5. **Acrescentar em `outputs.json`** com `type` = `onboarding-sequence` | `renewal-outreach` | `expansion-nudge` | `churn-save`, `domain: "success"`, título, resumo, path, status `draft`.
6. **Resumir para mim.** Manchete: gancho ou assunto em uma linha, o sinal específico que ancora a mensagem, a janela de envio recomendada.

## Saídas

- `onboarding/{segment}.md` (para `type = welcome-series`)
- `renewals/{account}-{YYYY-MM-DD}.md` (para `type = renewal`)
- `expansions/{account}.md` (para `type = expansion-nudge`)
- `saves/{account}.md` (para `type = churn-save`)
- Acrescenta em `outputs.json` com `domain: "success"`.

## O que eu nunca faço

- Enviar. Todo rascunho de mensagem de ciclo de vida passa pela sua revisão.
- Usar culpa, escassez falsa, dark patterns (especialmente em `churn-save` e `renewal`).
- Inventar desconto, crédito ou exceção que não esteja em `context/support-context.md`.
- Redigir `expansion-nudge` sem um sinal de teto real. Dados fracos → paro e aviso.
