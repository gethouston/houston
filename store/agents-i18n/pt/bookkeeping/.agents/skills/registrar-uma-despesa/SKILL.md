---
name: registrar-uma-despesa
title: "Registrar uma despesa"
description: "Registro uma única despesa a partir de um recibo encaminhado (imagem, PDF, ou e-mail) e produzo uma despesa categorizada mais um lançamento contábil balanceado. Extraio o fornecedor, a data, o valor e os itens de linha por leitura multimodal, escolho um código de conta contra o seu plano de contas travado (tudo abaixo de 0.90 de confiança vai para Suspenso com o recibo anexado), e elaboro o lançamento de partida dobrada com o lado do crédito definido conforme a forma de pagamento (cartão corporativo, empréstimo do fundador, dinheiro, ou ACH). O submodo `mode=batch` agrupa N recibos em um único lançamento contábil resumo que credita Empréstimo do Fundador a Pagar ou Reembolsos a Provisionar. Somente rascunho, eu nunca lanço nada."
version: 1
category: Contabilidade
featured: no
image: ledger
integrations: [gmail, outlook, quickbooks, xero]
---


# Registrar uma Despesa

Um recibo entra, uma despesa categorizada e um lançamento contábil balanceado saem. Para reembolsos de fundador, pagamentos a fornecedores do próprio bolso, ou qualquer despesa que não apareceu no feed de banco ou cartão. Todo recibo produz um lançamento contábil balanceado com o código de conta validado contra o seu plano de contas, ou vai para Suspenso com a imagem anexada.

Somente rascunhos: o lançamento contábil é gravado com `status: "draft"`. Eu nunca lanço automaticamente no QuickBooks ou Xero.

## Quando usar

- O usuário encaminha um único recibo (imagem, PDF, e-mail) ou diz "lance este recibo" / "categorize este reembolso".
- Despesa ausente do feed de banco / cartão (reembolsada em cartão pessoal, paga via ACH de outra entidade, em dinheiro).
- `mode=batch`, "processe estes 20 recibos do Q1" / "lance o lote de reembolso do fundador", produz um único lançamento contábil resumo creditando Empréstimo do Fundador a Pagar (ou Reembolsos a Provisionar se do mesmo período).

## Conexões que preciso

Executo trabalho externo pelo Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Gmail ou Outlook** (caixa de entrada), opcional, permite puxar um recibo encaminhado e seus anexos diretamente do seu e-mail. Se não conectado, você pode enviar o arquivo no chat ou na pasta de entrada de recibos.
- **QuickBooks Online ou Xero** (contabilidade), opcional, usado apenas se você quiser que eu consulte o histórico do fornecedor. O lançamento contábil em si fica como rascunho no disco, eu nunca lanço.

Esta habilidade nunca bloqueia por falta de conexão. Você sempre pode enviar o recibo como arquivo.

## Informações que preciso

Eu leio o seu contexto contábil primeiro. Para todo campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **Um plano de contas**, obrigatório. Motivo: toda categoria que eu atribuir precisa vir do seu plano de contas. Se faltar, pergunto: "Já temos um plano de contas? Se não, vamos elaborar um primeiro."
- **Um contexto contábil finalizado**, obrigatório. Motivo: preciso do seu método contábil e contas registradas para lançar o lado do crédito corretamente. Se faltar, pergunto: "Já configuramos os livros? Se não, vamos rodar a configuração primeiro."
- **O recibo em si**, obrigatório. Motivo: fornecedor, data e total são extraídos dele. Se faltar, pergunto: "Você pode encaminhar o recibo, enviar o PDF ou a imagem, ou colar o fornecedor / data / valor?"
- **Como a despesa foi paga**, obrigatório. Motivo: direciona a linha de crédito (cartão corporativo versus empréstimo do fundador versus dinheiro). Se faltar, pergunto: "Como isso foi pago, em um cartão corporativo (qual?), um cartão pessoal que será reembolsado, dinheiro, ou um ACH de outra entidade?"
- **Uma conta registrada de Empréstimo do Fundador a Pagar**, opcional. Motivo: necessária apenas se o recibo foi pago do próprio bolso. Se você não tiver, pergunto uma vez e adiciono ao seu plano de contas.

## Passos

1. **Ler o contexto e travar o plano de contas.** Carregar `context/bookkeeping-context.md` (parar se ausente, pedir para rodar `set-up-my-books`), `config/context-ledger.json`, `config/chart-of-accounts.json` (**travado** para a execução, parar se ausente), `config/prior-categorizations.json`, e `config/party-rules.json`.

2. **Resolver as entradas do recibo.** Ordem de prioridade:
   - **Anexo inline**, ferramenta de Leitura (multimodal) no caminho de arquivo fornecido pelo usuário. Funciona com PDF e imagens (JPG / PNG / HEIC).
   - **Encaminhamento de e-mail**, `composio search inbox`, escolher o slug do Gmail / Outlook, buscar a mensagem por ID ou tópico, depois ler os arquivos anexos.
   - **Envio de arquivo**, `expenses/_inbox/*.{pdf,jpg,png,heic,eml}` na raiz do agente.

3. **Extrair os campos por recibo** via Leitura multimodal:
   - `vendor`, nome do estabelecimento como impresso.
   - `date`, YYYY-MM-DD; se só `MM-DD` estiver impresso, inferir o ano pelo contexto.
   - `total`, valor em dólares positivo (inverter para o lado de crédito do lançamento contábil).
   - `lineItems[]`, opcional, quando o recibo tem itens discriminados: cada `{description, amount, quantity?}`.
   - `paymentMethod`, "cartão pessoal" / "cartão corporativo 9041" / "dinheiro" / "ACH", perguntar uma vez se ilegível.
   - `taxAmount`, `tipAmount`, quando discriminados separadamente.
   - `currency`, padrão USD; se estrangeira, registrar e perguntar uma vez o valor na moeda local como liquidado.

   Se algum campo obrigatório (fornecedor / data / total) não puder ser extraído, parar e fazer UMA pergunta direcionada. Nunca advinhar.

4. **Canonicalizar o fornecedor**, mesma receita de `categorize-my-transactions`: remover prefixos de ruído e números de referência, Iniciais Maiúsculas. Correspondência aproximada (índice de conjunto de tokens ≥ 0,85) contra `prior-categorizations` / `party-rules`; preferir a chave armazenada como forma canônica.

5. **Escolher o código de conta.** Ordem de prioridade:
   1. Correspondência exata em `party-rules` → `confidence: 1.00`, `source: "rule"`.
   2. Correspondência aproximada em `prior-categorizations` (índice ≥ 0,85, código armazenado no plano de contas) → `confidence: 0.95`, `source: "prior_year"`.
   3. Raciocinar contra o plano de contas travado usando fornecedor mais descrição mais itens de linha mais valor mais o contexto do fundador (viagem versus escritório versus contratado de P&D). Confiança `≥ 0.90` → `source: "ai"`.
   4. Senão → Suspenso (`glCode = universal.suspenseCode.code`, confidence `0.50`, `category_status: "uncategorized"`).

   Nunca inventar códigos de conta. Se o recibo tiver linhas claramente separáveis (por exemplo, refeições mais hospedagem em um único talão de hotel), dividir em várias linhas de débito.

6. **Elaborar o lançamento contábil.** Partida dobrada balanceada, um por recibo:
   - **Débitos**, linha(s) de despesa categorizada por `glCode`.
   - **Crédito**, determinado por `paymentMethod`:
     - `cartão corporativo {last4}` → conta do cartão (`context-ledger.domains.banks.accounts[].glCode` para aqueles últimos 4 dígitos). Nota: mais tarde faz deduplicação contra o feed do cartão, sinalizar `supportingDocs` para que `reconcile-my-accounts` detecte lançamento em duplicidade.
     - `cartão pessoal` / `dinheiro` / reembolsado → creditar `Empréstimo do Fundador a Pagar` (buscar no plano de contas; perguntar UMA vez para registrar se ausente).
     - `ACH` de outra entidade → creditar `Devido a Parte Relacionada` ou `Empréstimo do Fundador a Pagar`, o que for aplicável.
   - Memorando: `"{fornecedor}, {data}, {descrição curta}"`.
   - Todo `glCode` validado contra `config/chart-of-accounts.json`.
   - `sum(debits) === sum(credits)` até 1 centavo.
   - `status: "draft"`, `reversing: false`, `period` = `YYYY-MM` da data do recibo.

7. **Ramo `mode=batch`.** Se acionado:
   - Fazer os Passos 2 a 5 para cada recibo do lote.
   - Produzir o markdown de despesa por recibo (Passo 8) para rastreabilidade.
   - Produzir UM lançamento contábil resumo: uma linha de débito por código de conta único (somada entre recibos), um crédito:
     - `Reembolsos a Provisionar` se os recibos forem do mesmo período e o reembolso ainda não tiver sido feito.
     - `Empréstimo do Fundador a Pagar` se o fundador adiantou as despesas (comum em pré-seed).
   - `supportingDocs[]` lista todo caminho de markdown por recibo.
   - Memorando: `"Lote de reembolso do fundador, {N} recibos, {período}"`.

8. **Gravar o documento de despesa por recibo** em `expenses/{YYYY-MM-DD}-{vendor-slug}.md`. Estrutura:
   - Cabeçalho: fornecedor, data, valor, forma de pagamento, confiança, origem.
   - Tabela de itens de linha (se discriminado).
   - **Lançamento contábil (rascunho)**, lançamento balanceado inline, tabela markdown `{glCode | glName | debit | credit | memo}`.
   - Caminho do recibo anexado (copiado para `expenses/_attachments/` na primeira vez que for visto).
   - Perguntas em aberto (se algum campo foi perguntado inline).

9. **Atualizar os índices**, todos leitura-mesclagem-gravação, atômicos (`.tmp` mais renomear):
   - `journal-entries.json` na raiz do agente, anexar o lançamento contábil com o esquema completo de `data-schema.md` (`id, date, type: "adjustment" | "reclass", memo, reversing: false, period, lines[], status: "draft", supportingDocs[]`).
   - Se a categoria for para Suspenso, anexar a `suspense.json`.
   - `outputs.json`, uma linha por recibo `{type: "expense-receipt", title, summary, path, status: "draft", domain: "transactions"}`. No modo lote, anexar também a linha resumo `{type: "journal-entry", title: "Lote de reembolso {período}", ...}`.

10. **Resumir para o usuário.** Um bloco compacto:
    - Contagem de recibos, total em dólares, divisão de categorias (categorizado / Suspenso).
    - Histograma de código de conta (os 3 principais códigos com valores).
    - Caminho(s) dos documentos de despesa e dos lançamentos contábeis elaborados.
    - Lembrete: o lançamento contábil é `draft`, você lança no QuickBooks Online / Xero.

## Saídas

- `expenses/{YYYY-MM-DD}-{slug}.md`, um arquivo por recibo (também no modo lote, para rastreabilidade).
- `expenses/_attachments/`, arquivos de recibo copiados de `_inbox/` ou da busca no Composio.
- `journal-entries.json`, leitura-mesclagem-gravação, lançamento contábil anexado com `status: "draft"`.
- `suspense.json`, apenas se alguma linha for para Suspenso.
- `outputs.json`, uma linha por recibo mais a linha resumo no modo lote.
