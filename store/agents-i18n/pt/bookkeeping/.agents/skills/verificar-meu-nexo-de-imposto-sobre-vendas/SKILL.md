---
name: verificar-meu-nexo-de-imposto-sobre-vendas
title: "Verificar meu nexo de imposto sobre vendas"
description: "Descubra onde você deve imposto sobre vendas. Somo a receita e o número de transações por estado dos EUA a partir do Stripe (ou QuickBooks / Xero / faturas como alternativa), comparo os totais de cada estado com seu limite de nexo econômico para o trimestre e os últimos 12 meses, identifico o mês exato em que cada estado ultrapassado foi acionado, e sinalizo os estados com nexo físico (funcionários W-2, escritórios, estoque / FBA). Classifico a exposição do maior para o menor valor em dólares e destaco os estados mais próximos de ultrapassar o limite como alertas antecipados. Eu preparo, você registra e recolhe através da Avalara, TaxJar, ou diretamente no portal do estado."
version: 1
category: Contabilidade
featured: no
image: ledger
integrations: [stripe, quickbooks, xero]
---


# Verificar meu nexo de imposto sobre vendas

Verificação de nexo econômico estado por estado. Eu somo a receita e as transações por estado dos EUA para o período, comparo com o limite de cada estado, identifico o mês de ultrapassagem, e sinalizo os acionadores de nexo físico (funcionários, escritórios, estoque) independentemente da receita. A exposição é classificada do maior para o menor valor em dólares; os três estados mais próximos de ultrapassar aparecem como alertas antecipados. Eu nunca registro e nunca recolho.

## Quando usar

- "onde devemos imposto sobre vendas" / "verificação de nexo" / "exposição de imposto sobre vendas por estado".
- Trimestral, ao final do trimestre fiscal.
- A empresa ultrapassa uma marca redonda de receita ($500 mil, $1 milhão, $5 milhões) ou adiciona funcionários em um novo estado.

## Conexões que preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Stripe** (cobrança), obrigatório para extrair as cobranças com estado de cobrança / envio para a agregação de receita por estado. Obrigatório se o Stripe for sua principal fonte de contratos.
- **QuickBooks Online ou Xero** (contabilidade), extrai as tags de estado de fatura / cliente como alternativa ou complemento ao Stripe. Opcional.

Se nenhuma das categorias obrigatórias estiver conectada, eu paro e peço para você conectar o Stripe primeiro, já que a maioria das startups fatura através dele.

## Informações que preciso

Eu leio primeiro o seu contexto contábil. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **O estado sede da sua empresa** - Obrigatório. Por quê: base do nexo físico; você deve imposto sobre vendas lá independentemente da receita. Se estiver faltando, pergunto: "Em qual estado a empresa está sediada ou foi constituída?"
- **Como você fatura clientes e onde os contratos ficam** - Obrigatório. Por quê: define a fonte que eu uso para a receita por estado. Se estiver faltando, pergunto: "Como vocês faturam os clientes, principalmente pelo Stripe, pelo QuickBooks ou Xero, ou em outro lugar?"
- **Estados onde você já coleta ou declara imposto sobre vendas** - Opcional. Por quê: me permite marcar estados já registrados como "sem ação" em vez de "nova exposição". Se estiver faltando, pergunto: "Vocês já são registrados para coletar imposto sobre vendas em algum lugar? Se não tiver, eu continuo e sinalizo toda ultrapassagem como nova."
- **Onde seus funcionários trabalham fisicamente** - Opcional. Por quê: qualquer funcionário W-2 em um estado cria nexo físico independentemente da receita. Se estiver faltando, pergunto: "Vocês têm funcionários trabalhando em estados além do estado sede? Se não tiver, eu anoto como pendente e destaco as verificações de nexo físico para o usuário confirmar."

## Passos

1. **Ler o contexto.** Carregar `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Registro obrigatório: `universal.company.state`, `domains.revenue.contractSource`, `domains.tax.stateFilingFootprint`. A tributação de SaaS varia por estado, calcular a exposição independentemente da postura de tributação.

2. **Determinar o período.** Usar `{YYYY-QN}` do usuário se fornecido; senão, o trimestre fiscal completo mais recente. Também reportar a visão móvel de 12 meses (a maioria dos limites de estado mede assim).

3. **Extrair receita por estado de destino.** Ordem de prioridade da fonte:
   a. **Stripe via Composio.** `composio search billing` → descobrir o slug do Stripe → extrair as cobranças do período com estado de cobrança / envio do cliente. SaaS usa endereço de cobrança; produtos enviados usam o destino de envio. Recorrer ao país do cartão mais o CEP se o endereço estiver faltando.
   b. **Faturas (CSV / colar).** O usuário fornece dados no nível de fatura com estado, valor, data, id do cliente.
   c. **Sistema contábil via Composio.** Lista de clientes do QuickBooks Online / Xero com tags de estado.
   Nenhuma disponível, parar, pedir uma fonte. Nunca inventar atribuições de estado.

4. **Agregar por estado.** Somar a receita; contar as transações distintas (os limites usam "transações separadas", uma fatura com múltiplas linhas conta como uma; uma assinatura mensal conta como 12 por ano por cliente).

5. **Comparar com os limites de nexo econômico.** Usar a tabela de referência (verificar novamente a orientação atual do órgão fiscal estadual se a data em cache no registro tiver mais de 12 meses):

   | Estado | Limite (OU, salvo indicação) |
   |---|---|
   | CA | $500 mil de receita (sem contagem de transações) |
   | NY | $500 mil de receita E 100 transações (ambos) |
   | TX | $500 mil de receita (sem contagem de transações) |
   | FL | $100 mil de receita (sem contagem de transações) |
   | IL | $100 mil OU 200 transações |
   | MA | $100 mil (sem contagem de transações) |
   | WA | $100 mil (sem contagem de transações) |
   | CO | $100 mil (sem contagem de transações) |
   | GA | $100 mil OU 200 transações |
   | NC | $100 mil OU 200 transações |
   | PA | $100 mil (sem contagem de transações) |
   | OH | $100 mil OU 200 transações |
   | VA | $100 mil OU 200 transações |
   | MI | $100 mil OU 200 transações |
   | NJ | $100 mil OU 200 transações |
   | Padrão (todos os demais) | $100 mil OU 200 transações |

   Estados "OU": ultrapassar qualquer um dos dois já gera nexo. Estados "E" (NY): precisa ultrapassar ambos. A maioria mede sobre os últimos 12 meses móveis ou o ano calendário anterior, anotar qual em cada linha.

6. **Data de ultrapassagem.** Para cada estado ultrapassado, percorrer a receita e as transações acumuladas mês a mês. Identificar o mês exato da ultrapassagem. A maioria dos estados dá de 30 a 60 dias de carência para registro.

7. **Sinalizações de nexo físico.** Independentemente do limite econômico:
   - Funcionários trabalhando no estado (via `domains.payroll` / sistema de RH, perguntar se não estiver registrado). Qualquer funcionário W-2 gera nexo físico.
   - Escritórios / espaço alugado.
   - Estoque (incluindo armazéns FBA).
   - Contratados: geralmente NÃO geram nexo (1099 não conta), mas alguns estados (por exemplo, TX) assumem posições mais agressivas, sinalizar, não concluir automaticamente.
   Nexo físico exige registro independentemente da receita.

8. **Classificar por exposição.** Ordenar os estados ultrapassados pela receita acumulada (decrescente). Cada linha: estado; receita no período mais o móvel de 12 meses; transações no período mais o móvel de 12 meses; limite aplicado; data de ultrapassagem; sinalização de nexo físico; exposição acumulada; próxima ação ("Registrar via Avalara / TaxJar / portal direto do órgão fiscal estadual" / "Contratar um consultor SALT" / "Já registrado conforme `stateFilingFootprint`" / "Monitorar, abaixo do limite").

9. **Escrever `compliance/sales-tax/{YYYY-QN}.md`.** Escrita atômica. Estrutura:
   - **Resumo**, estados ultrapassados, contagem de nexo físico, receita total exposta, já registrados versus novas ultrapassagens.
   - **Estados ultrapassados**, tabela classificada por exposição.
   - **Somente nexo físico**, estados com presença física mas abaixo do limite econômico.
   - **Não ultrapassados**, uma linha mostrando os 3 mais próximos do limite (alerta antecipado).
   - **Nota de tributação**, lembrar o usuário que a tributação de SaaS varia por estado; ultrapassar o limite não significa que toda venda é tributável. Precisa da orientação do órgão fiscal sobre o produto específico, decisão de julgamento para um consultor SALT.
   - **Nota de declaração**, "Apenas preparação. Registro via Avalara / TaxJar / portais diretos do estado. Recolhimento / declaração é por sua conta."

10. **Anexar a `outputs.json`.** Linha: `{type: "sales-tax-nexus", title: "Sales-tax nexus {YYYY-QN}", summary, path, status: "draft", domain: "compliance"}`. Ler, mesclar, escrever.

11. **Resumir para o usuário.** Um parágrafo: número de estados recém-ultrapassados, exposição total, top 3 por risco, sinalizações de nexo físico, próximo passo por estado ultrapassado. Nunca registrar, nunca recolher.

## Saídas

- `compliance/sales-tax/{YYYY-QN}.md` (indexado como `sales-tax-nexus`)
