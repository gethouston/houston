---
name: auditar-meus-gastos-com-saas
title: "Auditar meus gastos com SaaS"
description: "Veja seus gastos reais anualizados com SaaS em um só lugar, incluindo as assinaturas que você esqueceu que tinha. Eu agrego tudo que vem do seu provedor de faturamento, dos recibos na sua caixa de entrada e da sua biblioteca de contratos, sinalizo duplicatas e ferramentas sem uso, e mostro os três principais candidatos ao cancelamento com a justificativa. A maioria dos fundadores se surpreende com o número total na primeira vez."
version: 1
category: Operações
featured: no
image: clipboard
integrations: [gmail, outlook, stripe]
---


# Auditar Meus Gastos com SaaS

Habilidade de revelação-surpresa. A maioria dos fundadores solo não sabe o gasto anualizado real com SaaS. Trago isso à tona em um único arquivo.

## Quando usar

- "audite meus gastos com SaaS".
- "pelo que estou pagando".
- "encontre as assinaturas que esqueci".
- "quanto estamos gastando em ferramentas".

## Conexões que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Faturamento** (Stripe) - Obrigatório. Puxa cobranças recorrentes para que eu veja a lista real de assinaturas, não só o que você lembra.
- **Caixa de entrada** (Gmail, Outlook) - Obrigatório. Captura recibos e e-mails de renovação de ferramentas que não estão no seu cartão.
- **Arquivos** (Google Drive) - Opcional. Me ajuda a encontrar contratos assinados para que eu possa cruzá-los com as cobranças.

Se nem o faturamento nem a caixa de entrada estiverem conectados, paro e peço para você conectar seu faturamento primeiro.

## Informações que preciso

Leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Postura com fornecedores** - Obrigatório. Por que preciso: me diz o quão agressivo devo ser ao sinalizar duplicatas e candidatos a cancelamento. Se faltar, pergunto: "Como você costuma pensar sobre fornecedores, manter tudo enxuto e cancelar rápido, ou continuar com o que funciona?"
- **Lista de fornecedores conhecidos** - Opcional. Por que preciso: qualquer coisa que eu encontre fora dessa lista é uma assinatura esquecida. Se você não tiver isso, sigo em frente com TBD e trato tudo que eu encontrar como novo.
- **Auditoria anterior** - Opcional. Por que preciso: me permite sinalizar variação de preço desde a última vez. Se você não tiver isso, pulo a seção de variação de preço.

## Passos

1. **Leio `context/operations-context.md`** - o estágio + a postura com fornecedores ancoram os limites de severidade. Se faltar: paro, peço para rodar `set-up-my-ops-info`.

2. **Leio `config/procurement.json`** - `knownVendors` = lista conhecida; qualquer coisa que NÃO esteja na lista e for encontrada durante a auditoria = possível assinatura esquecida.

3. **Agrego as fontes.**

   - **Fonte A - biblioteca de contratos (`contracts/`).** Cada contrato analisado gera uma assinatura. Puxo: fornecedor, valor se conhecido, frequência de cobrança, data de renovação.
   - **Fonte B - faturamento conectado.** `composio search billing` → list-subscriptions / list-charges. Puxo cobranças recorrentes dos últimos 12 meses. Normalizo para o valor anualizado.
   - **Fonte C - recibos na caixa de entrada.** `composio search inbox` → busco por `receipt OR "subscription renewed" OR "payment confirmed" OR invoice` nos últimos 90 dias. Extraio domínio do remetente + valor + data. Captura assinaturas que não estão no cartão.

4. **Deduplico entre as fontes.** Cruzo por (nome de fornecedor normalizado) + (valor ± 5%) + (frequência de cobrança). Mesma assinatura em duas fontes → mesclo, anoto todas as fontes.

5. **Anualizo cada item.** Mensal × 12, trimestral × 4, anual × 1.

6. **Detecto padrões.**

   - **Duplicatas / sobreposições.** Duas ferramentas de gestão de projetos? Três gerenciadores de senha? Dois apps de notas? Sinalizo com uma linha "considere consolidar em {uma}."
   - **Ferramentas sem uso.** Para cada assinatura, tento verificar o uso: `composio search {category}` → o provedor tem API de último login ou de uso? Se não, uso como alternativa a "data do último recibo" versus "última atividade na caixa de entrada conectada" como indicador. Sinalizo qualquer coisa sem atividade-indicadora em 60+ dias.
   - **Assinaturas esquecidas.** Qualquer coisa encontrada na Fonte B ou C que NÃO esteja em `knownVendors` ou `contracts/` → destaco explicitamente.
   - **Variação de preço.** Se existir uma auditoria anterior em `spend/` e o valor anualizado do fornecedor subiu mais de 15%, sinalizo.

7. **Produzo a saída** (salva em `spend/{YYYY-MM-DD}-audit.md`):

   - **Destaque** - gasto anualizado total, contagem de assinaturas.
   - **Tabela de gastos** - ordenada pelo valor anualizado decrescente. Colunas: Fornecedor | Categoria | Anualizado | Cobrança | Próxima renovação | Última atividade | Sinalização.
   - **Duplicatas / sobreposições** - agrupadas por categoria.
   - **Sem uso (nenhuma atividade em 60+ dias)** - lista com evidências.
   - **Assinaturas esquecidas** - itens que não estão em `config/procurement.json` ou `contracts/`.
   - **Variação de preço** - deltas versus a auditoria anterior.
   - **Top 3 candidatos ao cancelamento** - os 3 cancelamentos de maior alavancagem (alto valor anualizado + baixo uso + sem armadilha de renovação automática). Cada um com justificativa de 3 linhas.

8. **Escritas atômicas** - `*.tmp` → renomear.

9. **Adiciono a `outputs.json`** com `type: "spend-audit"`, status "ready".

10. **Sugiro os próximos passos.**
    - Para cada top candidato ao cancelamento: "pronto para redigir o e-mail de cancelamento? Use `draft-a-message type=vendor` com o subtipo de cancelamento."
    - Se existirem assinaturas esquecidas e o contrato estiver faltando: "rode `read-a-contract` no {fornecedor} assim que você localizar o contrato."

## Saídas

- `spend/{YYYY-MM-DD}-audit.md`
- Adiciona a `outputs.json` com `type: "spend-audit"`.

## O que eu nunca faço

- **Cancelar uma assinatura.** Eu identifico candidatos; o fundador decide; `draft-a-message type=vendor` escreve o rascunho; o fundador envia.
- **Movimentar dinheiro, alterar dados de faturamento ou mudar formas de pagamento.** Somente leitura no faturamento.
- **Tratar os dados de faturamento como fonte da verdade.** Se as fontes discordam, mostro a divergência, não escolho um vencedor silenciosamente.
