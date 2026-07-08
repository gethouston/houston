---
name: categorizar-minhas-transacoes
title: "Categorizar minhas transações"
description: "Categorizo um lote de transações pendentes da sua fila do QuickBooks ou Xero, um CSV enviado, ou uma tabela colada. Normalizo cada contraparte, aplico primeiro suas regras salvas, depois a memória do ano anterior, e então raciocínio calibrado em relação ao seu plano de contas travado; tudo abaixo de 0.90 de confiança vai para Suspenso em vez de passar silenciosamente. O submodo `mode=rule-add` cria ou atualiza uma regra permanente `{party: gl_code}` depois de verificar que o código de conta existe. Somente rascunhos, eu nunca lanço no QuickBooks nem no Xero, eu nunca invento um código de conta."
version: 1
category: Contabilidade
featured: yes
image: ledger
integrations: [stripe, quickbooks, xero]
---


# Categorizar minhas transações

A companheira contínua do fluxo de extratos: eu pego as transações pendentes da sua fila do QuickBooks ou Xero, um CSV, ou uma tabela colada, e produzo um lote pronto para revisão agrupado em Pronto, Precisa de Revisão, e Suspenso. Dois invariantes: seu plano de contas fica travado durante a execução, e tudo abaixo de 0,90 de confiança vai para Suspenso em vez de passar silenciosamente.

Somente rascunhos: eu categorizo, sinalizo, e escrevo o lote de revisão. Você ou seu contador lançam no QuickBooks ou Xero.

## Quando usar

- "categorize essas transações pendentes" / "revise a fila pendente do QuickBooks Online" / "limpe a bandeja de não categorizados do Xero".
- CSV novo de itens pendentes enviado na raiz do agente ou em `transactions/_inbox/`.
- `mode=rule-add`, "faça 'Stripe Fee' sempre ir para 6700 daqui para frente" / "trave 'AWS' em 6210 para parar de perguntar".
- Chamado por `process-my-statements` ao final da execução para linhas que saíram como `uncategorized`, entrega opcional.

## Conexões que preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **QuickBooks Online ou Xero** (contabilidade), fonte preferida para a fila pendente / não categorizada ao vivo. Obrigatório se você quiser que eu extraia os itens pendentes diretamente.
- **Stripe** (cobrança), opcional, ajuda a categorizar taxas do processador e repasses quando aparecem na fila.

Se nenhuma ferramenta contábil estiver conectada, recorro a um CSV enviado ou a uma tabela colada. Se você não tiver nada para compartilhar, eu paro e peço para conectar o QuickBooks ou Xero, ou enviar um CSV com os itens pendentes.

## Informações que preciso

Eu leio primeiro o seu contexto contábil. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **Um plano de contas** - Obrigatório. Por quê: eu travo ele durante a execução; toda categoria que atribuo precisa vir do seu plano de contas, nunca inventada. Se estiver faltando, pergunto: "Já temos um plano de contas? Se não, vamos elaborar um primeiro, leva só alguns minutos."
- **Um contexto contábil finalizado** - Obrigatório. Por quê: preciso do seu método contábil, código de suspenso e contas registradas para categorizar corretamente. Se estiver faltando, pergunto: "Já configuramos os livros? Se não, rode a configuração uma vez para que eu saiba seu ano fiscal, método contábil e contas registradas."
- **As transações pendentes para revisar** - Obrigatório. Por quê: eu não consigo categorizar o que não consigo ver. Se estiver faltando, pergunto: "Onde estão as transações pendentes, no QuickBooks ou Xero, em um CSV que você pode enviar, ou colado no chat?"
- **Regras de fornecedor de um período anterior** - Opcional. Por quê: me permite associar novas cobranças a fornecedores conhecidos e evita perguntar a mesma coisa duas vezes. Se você não tiver, eu continuo e aprendo com esta execução.

## Passos

1. **Ler o contexto e travar o plano de contas.** Carregar:
   - `context/bookkeeping-context.md`, se estiver faltando, parar, pedir para o usuário rodar `set-up-my-books` primeiro.
   - `config/context-ledger.json`, contas, código de suspenso, dicas do slug contábil conectado.
   - `config/chart-of-accounts.json`, **travar** para a execução. Se estiver ausente, parar, pedir para o usuário rodar `build-my-chart-of-accounts` primeiro. Nunca inventar códigos no meio da execução.
   - `config/prior-categorizations.json`, memória de fornecedor para código de conta (objeto vazio se ausente).
   - `config/party-rules.json`, regras de correspondência exata (objeto vazio se ausente).

2. **Resolver a lista pendente.** Ordem de prioridade:
   - **Aplicativo conectado** (preferido): `composio search accounting`, escolher o slug do QuickBooks Online / Xero, extrair a fila pendente / não categorizada atual. Descobrir o esquema com `--get-schema`; nunca fixar no código. Sem conexão, apresentar o comando de conexão em um passo só.
   - **Envio de arquivo**: CSV em `transactions/_inbox/*.csv`, analisar com o `csv` padrão. Colunas obrigatórias `{date, description, amount}`; opcionais `{account_last4, statement_date, party}`.
   - **Colar**: tabela embutida na mensagem do usuário.

3. **Ramo `mode=rule-add`.** Se acionado:
   - Esperar pares `{canonical_party, gl_code}` (embutidos ou em arquivo).
   - Para cada par, validar que `gl_code` existe em `config/chart-of-accounts.json`. Se não, rejeitar o par com erro nomeado, NUNCA inventar código de conta.
   - Ler, mesclar, escrever `config/party-rules.json`: inserir ou atualizar `{canonical_party: gl_code}`. Escrita atômica (`.tmp` mais renomear).
   - Relatar uma linha por atualização; pular o resto da habilidade.

4. **Canonicalizar as contrapartes.** Para cada linha pendente, derivar o nome canônico da contraparte da mesma forma que `process-my-statements` faz: remover prefixos de ruído (`POS DEBIT`, `CHECKCARD`, `ACH`, `SQ *`, `TST*`, `ONLINE PMT`), remover números de referência finais e sufixos de cidade/estado, colapsar espaços, usar Title Case. Se o nome limpo tiver correspondência aproximada com uma chave em `prior-categorizations` ou `party-rules` (token-set ratio maior ou igual a 0,85), usar a chave armazenada como a forma canônica.

5. **Categorizar cada transação.** Ordem de prioridade, parar no primeiro acerto:

   1. **Correspondência exata em `party-rules`** → código de conta da regra, `confidence: 1.00`, `source: "rule"`.
   2. **Correspondência aproximada em `prior-categorizations`** (token-set ratio maior ou igual a 0,85 E código de conta armazenado existe no plano de contas) → código de conta armazenado, `confidence: 0.95`, `source: "prior_year"`.
   3. **Raciocínio em relação ao plano de contas**, escolher a melhor linha do plano de contas travado usando descrição mais contraparte canônica mais valor mais tipo de conta. Atribuir confiança calibrada:
      - `≥ 0.95`, óbvio, sem ambiguidade.
      - `0.90–0.94`, um candidato razoável, não certo.
      - `< 0.90` → Suspenso (próxima regra). `source: "ai"`.
   4. **Suspenso**, `glCode` = `universal.suspenseCode.code`, `confidence: 0.50`, `source: "ai"`, `category_status: "uncategorized"`.

   Regras de `category_status`:
   - `ready_for_approval` se `confidence ≥ 0.90` E `source ∈ {rule, prior_year}`.
   - `review_categorization` se `confidence ≥ 0.90` E `source = "ai"`.
   - `uncategorized` se `confidence < 0.90`.

   Nunca inventar código de conta que não esteja no plano de contas travado.

6. **Escrever o lote de revisão** em `transactions/{YYYY-MM-DD}.md` (data da execução, não da transação). Estrutura:
   - Cabeçalho: data da execução, fonte (slug do aplicativo / caminho do CSV), contagem total, volume total absoluto em dólares.
   - **Pronto para aprovação**, tabela agrupada por código de conta, cada linha `{date | party | description | amount | glCode | glName | confidence | source}`.
   - **Precisa de revisão**, mesma tabela, uma linha por item `review_categorization`; incluir uma justificativa de uma linha "por que este código".
   - **Suspenso**, mesma tabela para itens `uncategorized`, ordenada decrescente por `abs(amount)`.
   - **Sugestões de novas regras de fornecedor**, qualquer contraparte canônica que apareça 3 vezes ou mais nesta execução com o mesmo código de conta escolhido pela IA e confiança maior ou igual a 0,90. Renderizado como JSON pronto para rodar de `mode=rule-add` para que o usuário aprove em um único passo.

7. **Persistir os aprendizados** (somente depois que o usuário confirmar o grupo `ready_for_approval`, ou ao final da execução se não houver confirmação). Ler, mesclar, escrever `config/prior-categorizations.json`: inserir ou atualizar `{canonical_party: gl_code}` para toda linha com `source ∈ {rule, prior_year}` OU `confidence ≥ 0.95`. NUNCA persistir itens com `confidence < 0.90`, isso envenena a próxima execução.

8. **Atualizar o índice de Suspenso.** Para cada item `uncategorized`, ler, mesclar, escrever `suspense.json` na raiz do agente com `{id, date, party, description, amount, addedAt}`. Atualizar `updatedAt` em entradas existentes; sem duplicatas.

9. **Anexar a `outputs.json`.** Uma linha: `{type: "categorization", title: "Categorization batch {YYYY-MM-DD}", summary, path, status: "draft", domain: "transactions"}`. Ler, mesclar, escrever; nunca sobrescrever o array.

10. **Resumir para o usuário.** Um bloco curto: contagens por grupo, total de dólares em Suspenso (sinalizar com destaque), novas contrapartes adicionadas, sugestões de regras de fornecedor com o comando exato para aprovar.

## Saídas

- `transactions/{YYYY-MM-DD}.md`, lote categorizado pronto para revisão.
- `config/prior-categorizations.json`, ler, mesclar, escrever; atualizado com a memória de fornecedor de alta confiança desta execução.
- `config/party-rules.json`, somente em `mode=rule-add`, ler, mesclar, escrever com as atualizações verificadas.
- `suspense.json`, ler, mesclar, escrever com os novos itens não categorizados.
- `outputs.json`, uma linha anexada, `type: "categorization"`.
