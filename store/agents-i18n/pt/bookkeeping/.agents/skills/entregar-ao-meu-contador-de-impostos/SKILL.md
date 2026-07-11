---
name: entregar-ao-meu-contador-de-impostos
title: "Entregar ao meu contador de impostos"
description: "Monto o pacote de fim de ano para o seu contador de impostos. Exijo uma auditoria limpa como pré-requisito (`audit-my-books` roda primeiro; pendências bloqueiam a entrega), e depois reúno o balancete, as conciliações por conta, os cronogramas de ativo fixo e depreciação, a lista de 1099, a classificação de P&D (se elegível), os candidatos a ajuste M-1 (não dedutibilidade de refeições em 50% / 100%, diferenças de tempo entre livro e fiscal na remuneração em ações, diferenças entre regime de competência e caixa, imposto de renda federal, receita diferida, despesas não dedutíveis), e um registro das decisões de julgamento tomadas. Espelho opcional no Google Drive compartilhado com seu contador como comentarista. Eu redijo o e-mail para o seu contador, nunca envio e nunca apresento nada."
version: 1
category: Contabilidade
featured: no
image: ledger
integrations: [googledrive, gmail, outlook]
---


# Entregar ao Meu Contador de Impostos

Pacote de entrega fiscal de fim de ano. Bloqueado por `audit-my-books`, os livros precisam estar limpos primeiro. Uma vez limpos, monto o fechamento fiscal completo em `handoffs/tax-{year}/`, opcionalmente espelho no Google Drive, e redijo o e-mail para o seu contador com o link da pasta. Nunca declarado, nunca enviado.

## Quando usar

- "feche o ano para o contador de impostos" / "prepare o fechamento fiscal" / "entregue ao nosso contador" / "pacote de fim de ano para impostos".
- Rodar uma vez por ano fiscal, depois que o `close-my-month` do último mês concluir.

## Conexões que preciso

Executo trabalho externo pelo Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Google Drive** (arquivos), opcional, permite espelhar a pasta inteira de entrega em um local compartilhado que seu contador de impostos pode ver. Se não conectado, eu mantenho o pacote local.
- **Gmail ou Outlook** (caixa de entrada), opcional, permite criar um e-mail de rascunho para o seu contador de impostos com o link do pacote. Eu nunca envio. Se não conectado, escrevo o texto do e-mail em um arquivo de rascunho.

Se você quiser tanto o espelho no Drive quanto o rascunho do e-mail e nenhum estiver conectado, eu nomeio as duas categorias e peço para você conectar a que preferir.

## Informações que preciso

Eu leio o seu contexto contábil primeiro. Para todo campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **O ano fiscal que você está entregando**, obrigatório. Motivo: define o intervalo de datas para o balancete e os cronogramas de suporte. Se faltar, pergunto: "Qual ano fiscal vamos entregar, o mais recentemente concluído?"
- **Nome e e-mail do contador de impostos**, obrigatório. Motivo: entra no memorando de capa e no rascunho do e-mail. Se faltar, pergunto: "Quem está declarando o seu imposto de renda este ano, nome e e-mail para eu endereçar o pacote a essa pessoa?"
- **Se você está reivindicando o crédito de P&D**, obrigatório. Motivo: se sim, incluo a classificação de P&D no pacote. Se faltar, pergunto: "Você planeja reivindicar o crédito federal de P&D este ano, sim, não, ou ainda indeciso?"
- **Uma lista de ativos fixos capitalizados**, opcional. Motivo: direciona o cronograma de depreciação. Se você não tiver nenhum ativo capitalizado, pulo essa seção. Se faltar, pergunto: "Você tem algum ativo fixo capitalizado (notebooks comprados como ativo, equipamentos, benfeitorias em imóveis alugados)? Se não tiver, eu continuo sem cronograma de depreciação."
- **Fechamentos mensais limpos até o fim do ano**, obrigatório. Motivo: a entrega é bloqueada até os livros estarem limpos; quebras de conciliação e itens sem categorizar abertos precisam fechar primeiro. Se faltar, pergunto: "Já fechamos todos os meses do ano fiscal? Se não, vamos terminar isso primeiro, senão a entrega vai ter itens em aberto demais."

## Passos

1. **Ler o contexto.** Carregar `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Registro obrigatório: `universal.company` (razão social, EIN, tipo de entidade, ano fiscal), `universal.accountingMethod`, `domains.tax.preparerName`, `domains.tax.preparerEmail`, `domains.tax.rdCreditEligible`. Perguntar pelo contato do contador se estiver faltando (arquivo > colar) e guardar em cache.

2. **Determinar o ano fiscal.** Se especificado, usar esse; senão, usar por padrão o ano fiscal mais recentemente concluído conforme `universal.company.fiscalYearEnd`.

3. **Bloqueio, rodar `audit-my-books` primeiro.** Invocar a habilidade `audit-my-books` para o período que termina no fim do ano fiscal. Se restarem achados (suspenso, quebras de conciliação > $100 com mais de 30 dias, provisões vencidas, lançamentos contábeis presos em rascunho, candidatos a corte de período, lacunas de saldo de abertura, fusões de fornecedores de alta prioridade), PARAR. Apresentar a lista de bloqueios com o caminho da auditoria; pedir ao usuário para resolver cada um (ou confirmar explicitamente cada um como irrelevante). Não prosseguir até o usuário liberar o bloqueio.

4. **Balancete.** Invocar `prepare-my-financials` com `statement=trial-balance` e `as-of = fim do ano fiscal`. Gravar em `handoffs/tax-{year}/trial-balance.md`. Precisa bater até 1 centavo.

5. **Resumos de conciliação.** Para cada conta em `domains.banks.accounts[]`, copiar a conciliação mensal final de `reconciliations/{account_last4}/{YYYY-MM}.md` para a pasta de entrega, mais um resumo consolidado por conta em `handoffs/tax-{year}/reconciliations/{account_last4}.md` (abertura → atividade mensal → encerramento → itens não conciliados, deve estar vazio ou documentado a partir do bloqueio de auditoria).

6. **Cronograma de ativo fixo.** Ler `config/fixed-assets.json` (se ausente, perguntar ao usuário se existem ativos capitalizados; se não houver nenhum, pular). Incluir por ativo: data de entrada em serviço, custo de aquisição, método (linear / classe MACRS), vida útil, depreciação acumulada até o fim do ano, valor contábil líquido. Gravar em `handoffs/tax-{year}/fixed-asset-schedule.md`.

7. **Cronograma de depreciação.** Calcular o ano completo em linha reta a partir do cronograma de ativo fixo (convenção de meio ano por padrão; anotar no topo). Gravar em `handoffs/tax-{year}/depreciation-schedule.md`. Somente depreciação contábil, a depreciação fiscal (MACRS, §179, bônus) é cálculo do contador.

8. **Lista de 1099.** Invocar `prep-my-1099s` para o ano fiscal (pular a etapa de rascunho de e-mail se já tiver rodado). Copiar `compliance/1099s/{year}.md` → `handoffs/tax-{year}/1099-list.md`.

9. **Classificação de P&D (se elegível).** Se `domains.tax.rdCreditEligible == "yes"`, invocar `tag-my-rd-spend` para o ano e copiar `compliance/rd-credit/{year}.md` → `handoffs/tax-{year}/rd-classification.md`. Caso contrário, pular com uma linha no memorando de capa.

10. **Candidatos a ajuste M-1.** Escrever `handoffs/tax-{year}/m1-adjustments.md` listando diferenças comuns entre livro e fiscal com valores dos livros:
    - **Refeições**, não dedutibilidade de 50% em refeições em restaurante; não dedutibilidade de 100% na maioria das outras refeições pós-2023. Dividir por memorando quando possível; sinalizar `TBD` caso contrário.
    - **Remuneração em ações**, despesa contábil de remuneração em ações versus o momento fiscal (o fisco deduz no exercício / vesting conforme o plano).
    - **Diferenças entre regime de competência e caixa**, se a declaração for em regime de caixa enquanto os livros são em competência, listar os saldos de passivo provisionado mais contas a receber no fim do ano. Pular se ambos forem em competência.
    - **Despesa de imposto de renda federal**, dedução contábil, adição de volta fiscal.
    - **Receita não realizada**, saldo de receita diferida no fim do ano (o regime de caixa reconhece de forma diferente).
    - **Outras despesas não dedutíveis**, multas, penalidades, entretenimento (pós-TCJA), contribuições políticas.
    Cada linha: valor contábil, direção (adição de volta / dedução), memorando. Sinalizar toda decisão de julgamento, o contador finaliza.

11. **Notas de decisões de julgamento.** Percorrer `outputs.json` do ano fiscal e coletar todo destaque de "decisão de julgamento" (de `schedule-my-revenue`, `tag-my-rd-spend`, `draft-a-journal-entry type=stock-comp`, etc.). Gravar em `handoffs/tax-{year}/judgment-calls.md` com entradas por item: o que foi decidido, por quem, quando, alternativas consideradas. Trilha de auditoria do contador.

12. **Memorando de capa.** `handoffs/tax-{year}/cover-memo.md`, uma página. Bloco da empresa (razão social, EIN, tipo de entidade, estado, fim do ano fiscal); postura contábil; conteúdo do pacote (com marcadores e links); lucro líquido contábil; os 3 a 5 principais itens para a atenção do contador; TBDs em aberto; linha de assinatura.

13. **Espelho opcional no Google Drive.** Se `composio search files` retornar um slug do Drive conectado: criar a pasta `Entrega Fiscal {YYYY}, {Razão Social}`, enviar todo arquivo de `handoffs/tax-{year}/` preservando subpastas, compartilhar com `domains.tax.preparerEmail` como comentarista (nunca como editor). Capturar a URL no cabeçalho do memorando de capa. Pular silenciosamente se o Drive não estiver conectado.

14. **Redigir o e-mail para o contador.** Se `composio search inbox` retornar um slug do Gmail / Outlook conectado, criar um rascunho na caixa de entrada (nunca enviar) para `domains.tax.preparerEmail`, assunto `"Pacote de entrega fiscal {YYYY} de {Razão Social}"`, corpo referenciando o memorando de capa mais a URL do Drive (ou o caminho da pasta local) com um resumo curto do pacote e dos itens principais. Salvar o id/URL do rascunho no memorando de capa sob "Rascunho de e-mail para o contador". Sem conexão de caixa de entrada, escrever o texto do e-mail em `drafts/tax-preparer-handoff-{year}.md`.

15. **Anexar a `outputs.json`.** Linha: `{type: "tax-handoff", title: "Entrega fiscal {year}", summary, path: "handoffs/tax-{year}/cover-memo.md", status: "draft", domain: "compliance"}`. Leitura-mesclagem-gravação. Mudar para `ready` quando o usuário confirmar a revisão; `posted` só quando confirmarem que foi enviado ao contador.

16. **Resumir para o usuário.** Um parágrafo: pacote em `handoffs/tax-{year}/`, componentes incluídos, lucro líquido contábil, TBDs restantes, URL do Drive (se espelhado), id/caminho do rascunho de e-mail, lembrete de que eu nunca envio, você revisa e envia.

## Saídas

- `handoffs/tax-{year}/cover-memo.md` (indexado como `tax-handoff`)
- `handoffs/tax-{year}/trial-balance.md`
- `handoffs/tax-{year}/reconciliations/{account_last4}.md` (uma por conta)
- `handoffs/tax-{year}/fixed-asset-schedule.md`
- `handoffs/tax-{year}/depreciation-schedule.md`
- `handoffs/tax-{year}/1099-list.md`
- `handoffs/tax-{year}/rd-classification.md` (se elegível)
- `handoffs/tax-{year}/m1-adjustments.md`
- `handoffs/tax-{year}/judgment-calls.md`
- Espelho opcional em pasta do Google Drive (URL no memorando de capa)
- Rascunho na caixa de entrada para o contador de impostos (nunca enviado)
