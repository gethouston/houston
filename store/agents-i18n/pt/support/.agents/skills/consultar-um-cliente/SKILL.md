---
name: consultar-um-cliente
title: "Consultar um cliente"
description: "Me dê o nome de um cliente e escolha o que você precisa: um dossiê com o plano, histórico e pendências dele; uma linha do tempo completa de cada interação; uma pontuação de saúde (verde/amarelo/vermelho) com os três sinais por trás dela; ou uma checagem de risco de cancelamento que te diz se ele está se afastando e o que fazer a respeito. Um cliente, quatro ângulos."
version: 1
category: Suporte
featured: no
image: headphone
integrations: [gmail, hubspot, salesforce, attio, stripe]
---


# Consultar um cliente

Uma skill para toda pergunta do tipo "me fale sobre esse cliente" no fluxo de suporte. Ramifica por `view`.

## Quando usar

- **dossier**, "quem é esse cliente?" / "me fale sobre {account}" / implícito antes de rodar `draft-a-reply`.
- **timeline**, "me mostre a linha do tempo completa de {account}" / "histórico de {customer}" / implícito antes de `review-my-support scope=account-review` ou `draft-a-lifecycle-message type=renewal`.
- **health**, "pontue a saúde de {account}" / "como está {customer}" / "rode a saúde."
- **churn-risk**, "risco de cancelamento de {account}" / "escaneie risco de cancelamento" / "esse cliente está em risco?"

## Conexões de que preciso

Eu executo trabalho externo pelo Composio. Antes de rodar esta skill, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu nomeio a categoria, peço para você conectá-la na aba de Integrações e paro.

- **CRM** (HubSpot / Attio / Salesforce), puxa o nível do plano, o responsável e o registro da conta. Obrigatório.
- **Cobrança** (Stripe), puxa a receita mensal, o plano, a data de renovação e sinais de downgrade. Obrigatório para `health` e `churn-risk`.
- **Caixa de entrada** (Gmail / Outlook), busca o histórico completo de conversas para a visão de linha do tempo. Opcional se `conversations.json` já estiver preenchido.

Se nenhuma das categorias obrigatórias estiver conectada, eu paro e peço para você conectar seu CRM primeiro.

## Informações de que preciso

Eu leio seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Níveis de plano + seus pesos**, Obrigatório. Por que preciso disso: classifica os sinais corretamente para que o alerta de cancelamento de um cliente P1 não fique enterrado. Se faltar, eu pergunto: "Quais planos você vende, e quais deles contam como seu nível mais alto?"
- **Onde vive o histórico de conversas**, Obrigatório. Por que preciso disso: preciso puxar a linha do tempo completa da conta. Se faltar, eu pergunto: "Qual caixa de entrada ou central de atendimento guarda as conversas com seus clientes, quer que eu puxe de uma conectada ou você prefere enviar uma exportação recente?"
- **O que 'em risco' significa para você**, Obrigatório para `health` / `churn-risk`. Por que preciso disso: os limites para GREEN / YELLOW / RED vêm da sua definição operacional, não da minha. Se faltar, eu pergunto: "Quais sinais te dizem que um cliente está prestes a cancelar, queda de uso, pico de tickets de suporte, linguagem de cancelamento, algo mais?"

## Parâmetro: `view`

- `dossier`, perfil + plano + receita mensal (via Stripe conectado) + candidatos a bug abertos + follow-ups abertos + últimas 3 conversas. Escreve em `dossiers/{slug}.md`.
- `timeline`, consolidado cronológico de cada interação (ticket, ligação, compra, mudança de plano, pontuação de satisfação). Escreve em `timelines/{slug}.md`.
- `health`, GREEN / YELLOW / RED com 3 sinais determinantes, o raciocínio e UMA ação recomendada. Escreve uma entrada em `health-scores.json` (e versão em prosa em `dossiers/{slug}-health.md` se eu pedir).
- `churn-risk`, alerta de risco aberto com sinal (linguagem de cancelamento, fricção recorrente, queda brusca de uso), severidade e ação recomendada. Escreve uma entrada em `churn-flags.json`.

## Passos

1. **Resolver `{account}` ou `{slug}`.** Você me deu o nome do cliente? Procuro em `customers.json` por nome / e-mail / domínio. Sem correspondência? Peço o identificador do CRM (HubSpot / Attio / Salesforce via Composio) ou o perfil colado.
2. **Ler `config/context-ledger.json`.** Preencher lacunas.
3. **Ramificar por `view`:**
   - `dossier`: ler o registro do CRM + `customers.json` + filtrar `conversations.json` para esse cliente + checar `bug-candidates.json`, `followups.json`, `churn-flags.json`. Puxar receita mensal / plano do Stripe conectado. Escrever `dossiers/{slug}.md`.
   - `timeline`: as mesmas leituras do `dossier`, mas também puxar cada conversa, mudança de plano, fatura e pontuação de satisfação do Stripe conectado + CRM. Ordenar cronologicamente. Escrever `timelines/{slug}.md`.
   - `health`: computar 3 sinais (por exemplo, volume de tickets dos últimos 30 dias, tendência recente de uso do produto via PostHog, sentimento das últimas 3 interações). Aplicar os limites de `domains.success.churnSignals` (me peça para definir se não estiver configurado). Saída GREEN / YELLOW / RED + uma ação. Escrever em `health-scores.json` (ler-mesclar-escrever).
   - `churn-risk`: escanear os últimos 60 dias de conversas em busca de linguagem de cancelamento, 2+ sinais de frustração ou queda brusca de uso. Encontrou? Escrever uma nova entrada em `churn-flags.json` com sinal + severidade + próximo passo recomendado.
4. **Adicionar a `outputs.json`** com o `type` apropriado: `dossier` | `timeline` | `health-score` | `churn-risk`, `domain: "inbox"`, título, resumo, caminho.
5. **Resumir para mim** de forma direta: manchete (plano + status) + o único próximo passo mais útil.

## Saídas

- `dossiers/{slug}.md` (para `view = dossier`)
- `timelines/{slug}.md` (para `view = timeline`)
- entrada em `health-scores.json` (para `view = health`)
- entrada em `churn-flags.json` (para `view = churn-risk`)
- Adiciona a `outputs.json` com `domain: "inbox"`.

## O que eu nunca faço

- Apresentar uma pontuação de saúde ou um alerta de cancelamento que eu não consiga fundamentar em dados de `conversations.json`, do Stripe ou do CRM, marco como UNKNOWN e pergunto.
- Inventar números de plano / receita mensal / uso quando a conexão está faltando.
