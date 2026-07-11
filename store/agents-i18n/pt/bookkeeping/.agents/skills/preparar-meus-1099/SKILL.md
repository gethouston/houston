---
name: preparar-meus-1099
title: "Preparar meus 1099"
description: "Preparo sua lista de 1099-NEC e 1099-MISC para o ano fiscal. Somo os pagamentos acumulados do ano por fornecedor a partir do seu histórico de pagamentos, sinalizo os fornecedores elegíveis (não corporativos, ≥ $600), separo NEC de MISC, cruzo o status do W-9 com os W-9 que você tem arquivados, e elaboro e-mails de cobrança para os W-9 faltantes como rascunhos do Gmail / Outlook (ou como arquivos `.md` simples se nenhuma caixa de entrada estiver conectada). Eu preparo, você declara via IRS FIRE, Track1099, ou Tax1099. Eu nunca declaro e nunca envio."
version: 1
category: Contabilidade
featured: no
image: ledger
integrations: [gmail, outlook]
---


# Preparar Meus 1099

Preparação de 1099-NEC e 1099-MISC para o ano fiscal. Eu somo os pagamentos por fornecedor a partir das suas transações processadas, sinalizo quem é elegível, separo NEC de MISC, cruzo o status do W-9, e elaboro e-mails de cobrança para os W-9 faltantes. Os e-mails de cobrança ficam nos rascunhos do seu Gmail ou Outlook (nunca enviados) para você revisar e clicar em enviar. Eu preparo, você declara junto ao IRS.

## Quando usar

- "quem são nossos fornecedores 1099" / "prepare a lista de 1099 de {ano}".
- "elabore e-mails de cobrança para os W-9 faltantes".
- Chamado por `hand-off-to-my-tax-preparer` como parte do pacote de fim de ano.
- Chamado em janeiro para o ano fiscal anterior (prazo do IRS: 31 de janeiro para NEC).

## Conexões que preciso

Executo trabalho externo pelo Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Gmail ou Outlook** (caixa de entrada), opcional, permite criar rascunhos de e-mail de cobrança diretamente para fornecedores com W-9 faltando. Eu nunca envio. Se não conectado, escrevo o texto do e-mail em um arquivo de rascunho que você pode copiar.

Esta habilidade funciona totalmente offline a partir do seu histórico de execuções. Nenhuma conexão bloqueia a execução; a conexão de caixa de entrada só facilita os e-mails de cobrança.

## Informações que preciso

Eu leio o seu contexto contábil primeiro. Para todo campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **O ano fiscal**, obrigatório. Motivo: define o intervalo de datas para a agregação de pagamentos do ano. Se faltar, pergunto: "Para qual ano fiscal estamos preparando a lista de 1099? Em janeiro, uso por padrão o ano que acabou de terminar."
- **A razão social e o EIN da sua empresa**, obrigatório. Motivo: entra no bloco do pagador do 1099 em todo formulário. Se faltar, pergunto: "Qual é a razão social e o EIN da empresa como registrado junto ao IRS?"
- **Um histórico de execuções atual cobrindo o ano fiscal**, obrigatório. Motivo: agrego os pagamentos a fornecedores a partir das suas execuções processadas. Se faltar, pergunto: "Já processamos os extratos do ano fiscal? Se não, envie os extratos de banco e cartão de crédito para eu categorizar primeiro."
- **W-9 arquivados dos seus contratados**, opcional. Motivo: permite marcar cada fornecedor 1099 como "com-w9" e pular o e-mail de cobrança. Se você não tiver eles em um só lugar, pergunto: "Você tem os W-9 coletados em algum lugar? Se não, vou sinalizar todo fornecedor elegível como faltante e elaborar e-mails de cobrança para cada um."
- **Uma lista de e-mails de fornecedores**, opcional. Motivo: permite endereçar os e-mails de cobrança diretamente a cada fornecedor. Se você não tiver, deixo o destinatário em branco em cada rascunho e peço para você preencher.

## Passos

1. **Ler o contexto.** Carregar `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Registro obrigatório: `universal.company` (razão social mais EIN para o bloco do pagador do 1099), `domains.tax` (nome/e-mail do contador para a nota de capa).

2. **Determinar o ano fiscal.** O usuário especificou o ano → usar esse. Chamado em janeiro sem ano → usar por padrão o ano calendário anterior (`today.year - 1`), o ciclo de 1099 daquele ano. Chamado no meio do ano → usar o ano atual como rascunho em andamento.

3. **Agregar os pagamentos do ano por fornecedor.** Ler todo `runs/*/run.json` cujo período se sobreponha ao ano fiscal. Filtrar transações com `amount < 0` (dinheiro saindo), agrupar por `party` (nome canônico). Somar os valores absolutos por fornecedor dentro do intervalo de datas do ano fiscal. Citar toda transação por `(período da execução, data, valor)`, sem pagamentos inventados.

4. **Excluir pagamentos que não são declaráveis em 1099.**
   - Transferências (`gl_code == "9000"` / `source == "transfer"`).
   - Pagamentos a corporações (S-corp / C-corp isentas exceto categorias específicas como honorários de advogados). Presumir corporativo por padrão se o fornecedor canônico terminar em `Inc`, `Corp`, `LLC` (o W-9 confirma), `Corporation`, `Ltd`. Sinalizar para confirmação do usuário, excluir por padrão.
   - Pagamentos de folha (vão no W-2, não no 1099).
   - Pagamentos por cartão de crédito ao fornecedor. Fornecedor pago exclusivamente via cartão de crédito → a bandeira do cartão emite o 1099-K, excluir da lista. Sinalizar todo fornecedor pago apenas via cartão de crédito.
   - Reembolsos rotulados como repasse.

5. **Aplicar os limites de elegibilidade de 1099.**
   - **1099-NEC**, contratados / serviços (categorias de conta: serviços profissionais, mão de obra contratada, consultoria, contratados de engenharia). Limite: ≥ $600 no ano.
   - **1099-MISC**, aluguel, honorários de advogados (mesmo se incorporados), prêmios, pagamentos médicos, outros. Limite: ≥ $600 no ano.
   - Sinalizar fornecedores que atravessam categorias (por exemplo, escritório de advocacia pago tanto por serviços quanto por acordo judicial), o usuário decide a divisão.

6. **Cruzar o status do W-9.** Verificar `files/` (ou a pasta de W-9 de fornecedores fornecida pelo usuário) por PDF correspondente ao nome canônico de cada fornecedor elegível (correspondência aproximada, índice de conjunto de tokens ≥ 0,85). Registrar o status do W-9 por fornecedor: `have-w9` / `missing-w9` / `pending`. Lista de fornecedores com indicadores de W-9 fornecida em tempo de execução → mesclar.

7. **Elaborar e-mails de cobrança para os W-9 faltantes.** Para todo fornecedor sinalizado `missing-w9`:
   - Escrever `drafts/1099-chase-{vendor-slug}.md`, linha de assunto, corpo, assinatura. O corpo referencia o ano fiscal, o limite em dólares, o link do Formulário W-9 (`https://www.irs.gov/pub/irs-pdf/fw9.pdf`), e pede o retorno até uma data especificada (padrão: 15 de janeiro para a declaração do ano anterior).
   - `composio search inbox` retorna um slug do Gmail / Outlook conectado → criar rascunho na caixa de entrada (nunca enviar) usando o e-mail do fornecedor se conhecido por correspondência anterior; incluir a URL/id do rascunho no `.md`. Sem conexão → pular a etapa da caixa de entrada silenciosamente.
   - Citar o fornecedor canônico, o valor pago no ano, os períodos de execução de origem no corpo do rascunho para que o usuário possa verificar antes de enviar.

8. **Gravar `compliance/1099s/{year}.md`.** Gravação atômica. Estrutura:
   - **Bloco do pagador**, razão social, EIN, estado.
   - **Resumo**, contagem de NEC, total em dólares de NEC, contagem de MISC, total em dólares de MISC, contagem de W-9 faltantes.
   - **Destinatários NEC**, tabela: fornecedor canônico, valor pago no ano, detalhamento de categoria de conta, status do W-9, endereço (do W-9 se presente; senão `TBD`).
   - **Destinatários MISC**, mesmo formato de tabela.
   - **Excluídos**, exclusões corporativas, só-cartão-de-crédito, folha, transferências, um motivo por linha (para que o usuário possa auditar as exclusões).
   - **Casos de fronteira**, fornecedores onde a divisão NEC/MISC precisa de decisão de julgamento, com opções.
   - **Nota de declaração**, "Apenas preparação. Declare via IRS FIRE, Track1099, ou Tax1099. Prazo: 31 de janeiro (NEC ao destinatário mais ao IRS), 28 de fevereiro em papel / 31 de março eletrônico (MISC ao IRS)."

9. **Anexar a `outputs.json`.** Linha: `{type: "vendor-1099-list", title: "Lista de 1099 {year}", summary, path: "compliance/1099s/{year}.md", status: "draft", domain: "compliance"}`. Leitura-mesclagem-gravação.

10. **Resumir para o usuário.** Um parágrafo: contagem de NEC mais valor, contagem de MISC mais valor, contagem de W-9 faltantes com os caminhos dos e-mails de cobrança, quaisquer casos de fronteira que precisem de decisão, lembrete de declaração ("eu preparei, você declara via FIRE / Track1099 / Tax1099"). Nunca declaro. Nunca envio.

## Saídas

- `compliance/1099s/{year}.md` (indexado em `outputs.json` como `vendor-1099-list`)
- `drafts/1099-chase-{vendor-slug}.md` (um por W-9 faltante, não indexado; rascunhos)
- Rascunhos opcionais na caixa de entrada do Gmail / Outlook via Composio (nunca enviados)
