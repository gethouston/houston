---
name: configurar-meus-livros
title: "Configurar meus livros"
description: "Configuro seus livros do zero com uma única entrevista ao fundador que captura a entidade, o ano fiscal, o método contábil, as contas registradas, a postura de folha de pagamento, o modelo de receita, a frequência de reporte a investidores, e o contador de impostos, e depois escreve o resumo contábil vivo que todas as outras habilidades leem primeiro. O submodo `mode=opening-balances` captura seu balanço de abertura a partir de uma planilha, um CSV, ou uma exportação do seu contador anterior. Eu nunca conecto um banco, nunca lanço em um razão geral, nem movimento dinheiro a partir desta habilidade, só fatos e um resumo, ponto final."
version: 1
category: Contabilidade
featured: yes
image: ledger
integrations: [stripe]
---


# Configurar Meus Livros

A entrevista única com o fundador que ancora tudo o mais que eu faço. Eu escrevo o seu resumo contábil, tipo de entidade, ano fiscal, caixa versus competência, contas bancárias, folha de pagamento, modelo de receita, frequência de reporte a investidores, contador de impostos, e capturo um balancete de abertura se você tiver um. Toda outra habilidade lê o resumo primeiro e recusa trabalho substantivo sem ele.

Somente rascunhos e fatos: eu nunca declaro, nunca lanço no seu razão geral, nem conecto a um banco a partir desta habilidade.

## Quando usar

- "configure os livros" / "nos integre" / "elabore o resumo contábil".
- "atualize o contexto contábil" / "nosso ano fiscal mudou" / "passamos para o regime de competência em junho".
- `mode=opening-balances` - "capture nosso balancete de abertura" / "carregue nossos saldos iniciais desta planilha" / "lance o balancete de abertura do nosso contador anterior".
- Chamada implicitamente por outra habilidade que precisa do resumo e o encontra faltando - somente depois de confirmar com você diretamente.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Stripe** (faturamento) - opcional, me permite confirmar automaticamente o seu modelo de receita e a fonte de contratos.
- **Feed bancário** (bancário via Plaid) - opcional, a forma mais rápida de registrar suas contas bancárias e cartões de crédito.

Esta habilidade é principalmente uma entrevista, então nenhuma conexão trava a execução. Conexões só evitam que você tenha que digitar tudo.

## Informações que eu preciso

Eu leio o seu contexto contábil primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **Dados básicos da empresa: razão social, tipo de entidade, estado, EIN, fim do ano fiscal, estágio, setor** - Obrigatório. Por quê: molda a seção de patrimônio líquido, o calendário fiscal, e a pegada tributária. Se estiver faltando eu pergunto cada um por vez, um de cada vez, por exemplo: "Qual é a razão social da empresa nos documentos de registro?"
- **Contabilidade em regime de caixa ou de competência** - Obrigatório. Por quê: define se eu incluo provisões, receita diferida, e amortização de despesas antecipadas. Se estiver faltando eu pergunto: "Estamos mantendo os livros no regime de caixa ou de competência? Se vocês mudaram no meio do ano, quando a mudança aconteceu?"
- **Contas bancárias, cartões de crédito, e processadores de pagamento** - Obrigatório. Por quê: cada conta que eu acompanho precisa de um nome, os últimos 4 dígitos, e um banco. Se estiver faltando eu pergunto: "Quais contas bancárias e cartões de crédito o negócio usa? Conectar o seu feed bancário é o mais fácil."
- **Provedor de folha de pagamento e tamanho da equipe** - Obrigatório se você tiver funcionários. Por quê: define as linhas de folha de pagamento provisionada e remuneração em ações. Se estiver faltando eu pergunto: "Quem administra a folha de pagamento, Gusto, Rippling, Justworks, outro, ou ainda não há funcionários? E aproximadamente quantas pessoas estão na equipe?"
- **Modelo de receita** - Obrigatório. Por quê: assinatura, uso, serviços, ou combinação muda quais linhas de receita existem. Se estiver faltando eu pergunto: "Como o negócio ganha dinheiro, assinaturas recorrentes, baseado em uso, serviços, ou uma combinação?"
- **Nome e e-mail do contador de impostos** - Opcional. Por quê: entra automaticamente nas entregas de fim de ano para o contador de impostos. Se você ainda não tiver um, eu sigo em frente e pergunto depois.
- **Um balancete de abertura, no `mode=opening-balances`** - Obrigatório para esse submodo. Por quê: ancora todo número do balanço patrimonial daqui para frente. Se estiver faltando eu pergunto: "Você tem um balancete de fechamento dos seus livros anteriores ou do seu contador? Envie como planilha ou CSV com código de conta, nome, débito, e crédito."

## Passos

1. **Ler o estado existente.** Carregar `config/context-ledger.json` (criar um esqueleto vazio `{"universal":{},"domains":{}}` se ausente) e `context/bookkeeping-context.md` se existir - esta execução é uma atualização, não uma reescrita. Preservar tudo o que o fundador refinou; tocar apenas no que está desatualizado ou é novo.

2. **Determinar o modo.** Padrão = resumo completo. Se o usuário acionou `mode=opening-balances`, pular para o Passo 6.

3. **Coletar o que está faltando (uma pergunta direcionada por lacuna).** Para cada campo obrigatório do registro não definido, fazer UMA pergunta com dica de modalidade (aplicativo conectado > arquivo > URL > colar) e escrever a resposta atomicamente antes de continuar. Campos obrigatórios para o resumo completo:

   - `universal.company` - razão social, nome fantasia, tipo de entidade (c-corp / s-corp / llc / sociedade / firma individual), EIN, estado de constituição, fim do ano fiscal (`MM-DD`), data de fundação, estágio (pre-seed / seed / série-a / série-b / crescimento), setor.
   - `universal.accountingMethod` - `cash` ou `accrual`; se mudou no meio do ano, capturar `switchedOn` (YYYY-MM-DD).
   - `universal.suspenseCode` - padrão `{"code":"99999","name":"Suspense"}` a menos que o plano de contas anterior do fundador use um código diferente.
   - `domains.banks.accounts[]` - por conta bancária, cartão de crédito, Stripe, processador de pagamento: `last4`, `type`, `bank`, `glCode` (em branco tudo bem se o plano de contas ainda não existir), `glName`. Preferir conexão via Composio (categoria Plaid / bancário) a uma lista manual.
   - `domains.payroll` - provedor (gusto / rippling / justworks / deel / adp / none), periodicidade, `teamSize`, `stockCompPosture` (iso / nso / rsu / mix / none).
   - `domains.revenue` - `model` (saas-subscription / usage / services / marketplace / mix), postura de `asc606`, `contractSource`.
   - `domains.investors` - periodicidade, `anchorKpis[]` (por exemplo, receita anual, Margem Bruta, Queima, Runway), `format`.
   - `domains.tax` - `preparerName`, `preparerEmail`, `lastYearFiled`, `rdCreditEligible` (yes / no / tbd), `stateFilingFootprint[]`.

   Para cada campo preenchido, carimbar `capturedAt` (ISO-8601 UTC) e `source` onde o esquema pedir. Se o fundador disser "a definir" ou "ainda não", registrar `null` e anotar no resumo para perguntar de novo depois - mas NUNCA perguntar o mesmo campo duas vezes na mesma execução.

4. **Capturar os "nãos" específicos do fundador.** Uma pergunta aberta: "há algo que eu nunca devesse tocar sem aprovação explícita?" Comum: remuneração em ações (sem input de 409A), reconhecimento de receita em contratos não padronizados, transações com partes relacionadas, cripto. Registrar literalmente.

5. **Elaborar o resumo (~400-700 palavras, opinativo, direto).** Estrutura, em ordem:

   1. **Visão geral da empresa** - um parágrafo: razão social, tipo de entidade, estado, EIN, ano fiscal, estágio, setor.
   2. **Postura contábil** - método (caixa / competência), arcabouço (GAAP-startup / IFRS / base fiscal), mudanças no meio do ano com data.
   3. **Contas bancárias e cartões** - agrupadas por `last4`; cada uma com banco, tipo, código de conta, nome de conta. Sinalizar conta sem código de conta como `A DEFINIR - definir quando o plano de contas existir`.
   4. **Modelo de receita** - postura de assinatura / uso / serviços; tratamento ASC 606; localização dos contratos.
   5. **Postura de folha de pagamento** - provedor, periodicidade, tamanho da equipe, tipo de plano de remuneração em ações.
   6. **Pegada de conformidade** - lista de registros estaduais, postura sobre o crédito de P&D, notas de exposição a imposto sobre vendas.
   7. **Frequência para investidores** - mensal / trimestral / nenhuma; KPIs de referência; formato preferido.
   8. **Contador de impostos** - nome, e-mail, último ano declarado.
   9. **Nãos definitivos** - a nível de workspace ("nunca lançar no razão geral, nunca movimentar dinheiro, nunca declarar nada") + específicos do fundador.

   Seções rasas: marcar `A DEFINIR - {o que trazer da próxima vez}` e seguir em frente. Nunca inventar.

6. **Ramificação `mode=opening-balances`.** Se acionado:

   - Usuário enviou um arquivo: analisar xlsx com `openpyxl`, CSV com o módulo padrão `csv`. Mapa de colunas: aceitar `{code|account_code, name|account_name, debit, credit}` ou `{code, name, balance}` onde positivo = débito e negativo = crédito (confirmar a convenção de sinal diretamente se for ambígua).
   - Usuário digitando diretamente: aceitar linhas `{glCode, debit, credit}`.
   - Validar que cada `glCode` existe em `config/chart-of-accounts.json`. Se o plano de contas estiver ausente, parar e pedir ao usuário para rodar `build-my-chart-of-accounts` primeiro (ou rodar diretamente). NUNCA inventar código de conta aqui.
   - Validar `sum(debit) === sum(credit)` dentro de 1 centavo. Se estiver desequilibrado, mostrar a diferença e parar - NÃO ajustar.
   - Escrever `config/opening-trial-balance.json` atomicamente como `[{glCode, debit, credit}]`.
   - Atualizar `config/context-ledger.json → universal.openingBalances` com `{asOf, source, trialBalancePath, capturedAt}`.

7. **Escrever atomicamente.** Toda escrita: destino `{path}.tmp`, depois `rename`. Arquivos tocados nesta execução:
   - `context/bookkeeping-context.md` (sempre)
   - `config/context-ledger.json` (ler-mesclar-escrever - nunca sobrescrever)
   - `config/opening-trial-balance.json` (somente no modo de balanço de abertura)

8. **NÃO anexar a `outputs.json`.** O resumo é um documento vivo, não um entregável. O balancete de abertura é configuração, não saída. Nenhum dos dois é indexado.

9. **Resumir para o usuário.** Um parágrafo curto: o que foi capturado, o que ainda está a definir, o próximo passo exato (geralmente: "rode `build-my-chart-of-accounts` a seguir, depois solte os extratos bancários em `statements/_inbox/`").

## Saídas

- `context/bookkeeping-context.md` - resumo contábil vivo (na raiz do agente; nunca sob `.agents/` ou `.houston/`).
- `config/context-ledger.json` - mesclado com os campos recém-capturados.
- `config/opening-trial-balance.json` - somente quando `mode=opening-balances` é acionado.

Nenhuma entrada em `outputs.json` por design.
