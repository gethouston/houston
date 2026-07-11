---
name: preparar-meu-pacote-para-investidores
title: "Preparar meu pacote para investidores"
description: "Monto um pacote financeiro pronto para o conselho a partir do último fechamento: um resumo executivo de uma página (caixa, queima, runway, receita mensal / receita anual, margem bruta, número de funcionários, as 3 principais variações) seguido da DRE, balanço patrimonial, fluxo de caixa, KPIs de SaaS (cascata de receita mensal, NRR, margem bruta, payback de CAC), retenção por coortes se você tiver ≥ 6 coortes, e sensibilidade do runway. `mode=saas-metrics` pula o pacote completo e atualiza apenas receita mensal / receita anual / margem bruta / NRR. Espelho opcional no Google Docs para que o conselho possa comentar. Somente rascunhos, eu nunca envio nada."
version: 1
category: Contabilidade
featured: no
image: ledger
integrations: [googledocs]
---


# Preparar Meu Pacote Para Investidores

Pacote para o conselho a partir do seu último fechamento. Resumo executivo no topo, caixa, queima, runway, receita mensal / receita anual, margem bruta, número de funcionários, os 3 principais fatores de variação, seguido das demonstrações completas, KPIs de SaaS, retenção por coortes, e sensibilidade do runway abaixo. Espelho opcional no Google Docs para que seu conselho possa comentar no próprio documento. Somente rascunhos, eu nunca envio.

## Quando usar

- "elabore o pacote financeiro do conselho" / "prepare as finanças da atualização para investidores" / "monte o pacote para investidores do Q{N}".
- `mode=saas-metrics` - "atualize a receita mensal / receita anual" / "qual é o nosso NRR este mês" - pula o pacote completo, escreve apenas o arquivo de métricas.
- Depois que a habilidade `close-my-month` termina o mês de fim de trimestre, ou a qualquer momento que o usuário queira um pacote novo entre fechamentos.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Google Docs** (docs) - opcional, me permite espelhar o pacote em um Google Doc no qual seu conselho pode comentar. Se não estiver conectado, eu mantenho como um arquivo markdown.

Esta habilidade é montada inteiramente a partir dos seus meses já fechados, relatórios de runway, e cronogramas de reconhecimento de receita. Nenhuma conexão trava a execução.

## Informações que eu preciso

Eu leio o seu contexto contábil primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **Um fechamento concluído para o período** - Obrigatório. Por quê: o pacote copia a DRE, o balanço patrimonial, e o fluxo de caixa diretamente do fechamento. Se estiver faltando eu pergunto: "Já fechamos os livros do último mês? Se não, vamos rodar o fechamento primeiro."
- **Um relatório atual de queima de caixa e runway** - Obrigatório. Por quê: o pacote inclui caixa, queima, e sensibilidade do runway a partir do relatório de runway. Se estiver faltando eu pergunto: "Você quer que eu atualize o relatório de runway primeiro? Leva só um minuto."
- **O seu modelo de receita** - Obrigatório. Por quê: o pacote de SaaS inclui receita mensal / receita anual / NRR / retenção por coortes; empresas fora de SaaS pulam essas seções. Se estiver faltando eu pergunto: "Como o negócio ganha dinheiro, assinaturas recorrentes, baseado em uso, serviços, ou uma combinação?"
- **Os KPIs com que seus investidores se importam** - Opcional. Por quê: me permite ancorar o resumo executivo em números que seu conselho já acompanha. Se você não tiver isso, eu uso como padrão caixa, queima, runway, receita mensal / receita anual, e margem bruta.
- **Dados de contrato abrangendo pelo menos 13 meses** - Opcional. Por quê: necessário para o NRR de doze meses móveis e a retenção por coortes. Se você não tiver isso, eu pulo essas seções e anoto que elas vão aparecer assim que você tiver histórico suficiente.

## Passos

1. **Ler o contexto.** Carregar `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Campos obrigatórios do registro: `universal.company`, `universal.accountingMethod`, `domains.revenue.model`, `domains.investors.anchorKpis`. Campo faltando → uma pergunta direcionada com dica de modalidade (aplicativo conectado > arquivo > URL > colar), escrever atomicamente antes de continuar.

2. **Localizar o último fechamento.** Listar `closes/*/package.md`, escolher o mais recente `YYYY-MM`. Se o último fechamento estiver `draft` em `outputs.json`, avisar o usuário, perguntar: prosseguir com o rascunho ou esperar. Registrar o período do fechamento como a data de referência do pacote.

3. **Localizar o último relatório de runway.** Listar `runway/*.md`, escolher o mais recente pela data no nome do arquivo. Ler saldo de caixa, queima líquida (3 e 6 meses), meses de runway, as 3 principais sensibilidades de fatores de custo.

4. **Ler os cronogramas de reconhecimento de receita.** Modelos de SaaS/assinatura → carregar cada `revrec/{customer-slug}/{contract-slug}.json`. Receita mensal atual = soma do reconhecimento mensal ativo por contrato. Receita anual = receita mensal * 12.

5. **Calcular a cascata de receita mensal (se SaaS).** Doze meses móveis de cronogramas de reconhecimento de receita:
   - **Receita mensal nova** - contratos cujo primeiro mês de reconhecimento está no período.
   - **Receita mensal de expansão** - aumentos em contratos de clientes existentes (upsell, expansão de assentos).
   - **Receita mensal de contração** - reduções em contratos de clientes existentes (downgrade, redução de assentos).
   - **Receita mensal de churn** - contratos cujo reconhecimento parou no período (cliente perdido).
   - Receita mensal líquida nova = Nova + Expansão − Contração − Churn.
   Citar cada variação com o caminho `revrec/{customer}/{contract}.json` + id do contrato.

6. **Calcular o NRR sobre a coorte de doze meses móveis.** Coorte = clientes ativos há 12 meses. NRR = (receita mensal atual da coorte) / (receita mensal da coorte há 12 meses). Reportar como percentual. Só calcular se os dados de contrato abrangerem ≥ 13 meses.

7. **Calcular a margem bruta.** MB% = (Receita − custo dos produtos vendidos) / Receita, a partir da DRE do último fechamento. Extrair as linhas de receita + custo dos produtos vendidos diretamente de `closes/{YYYY-MM}/package.md`.

8. **Calcular o payback de CAC (opcional).** Se o gasto de marketing + Vendas e Marketing for identificável na DRE E a receita mensal nova for calculada: CAC = gasto de Vendas e Marketing / novos clientes; meses de payback de CAC = CAC / (receita mensal nova * MB%). Reportar apenas se ambos os insumos forem números reais - senão marcar `A DEFINIR - precisa de atribuição de gasto de marketing`.

9. **Construir a tabela de retenção por coortes (se houver dados de contrato).** Linhas = mês da coorte (primeiro mês do contrato); colunas = meses desde a aquisição (M0..M12+); células = receita mensal retida / receita mensal da coorte no M0. Uma linha por mês de coorte. Incluir apenas se existirem ≥ 6 coortes.

10. **Montar o pacote** em `investor-financials/{yyyy-qq}.md`. Slug do trimestre: `2026-q1`, `2026-q2`, etc. - derivado do mês do período do fechamento. Estrutura:
    1. **Resumo executivo (uma página)** - saldo de caixa, queima líquida média de 3 meses, meses de runway, receita mensal, receita anual, MB%, número de funcionários, os 3 principais fatores de variação versus o trimestre anterior.
    2. **DRE** - copiada do fechamento.
    3. **Balanço patrimonial** - copiado do fechamento.
    4. **Fluxo de caixa** - copiado do fechamento.
    5. **KPIs de SaaS (se aplicável)** - cascata de receita mensal, receita anual, NRR, MB%, payback de CAC.
    6. **Tabela de retenção por coortes** (se ≥ 6 coortes).
    7. **Runway + sensibilidade** - copiado do último relatório de runway.
    8. **Notas de decisões de julgamento** - qualquer posição que precise de confirmação do usuário (casos extremos na definição de churn, escopo do CAC).

    Cada KPI cita a fonte (caminho + linha do fechamento, caminhos de reconhecimento de receita, caminho do runway). Nenhum número inventado.

11. **Espelho opcional no Google Docs.** Se `composio search docs` retornar um slug do Docs conectado, espelhar o pacote em um novo Doc, incluir a URL no topo do `.md`. Sem conexão → pular silenciosamente.

12. **Ramificação `mode=saas-metrics`.** Pular as etapas 3, 9, 10 da montagem completa. Escrever `investor-financials/metrics-{YYYY-MM}.md` apenas com: receita mensal (atual + cascata), receita anual, MB%, NRR. Sem espelho no Docs.

13. **Escrita atômica.** `.tmp` + renomear para o caminho de destino.

14. **Anexar a `outputs.json`.** Linha: `{type: "investor-financials", title: "Pacote para investidores {yyyy-qq}" | "Métricas de SaaS {YYYY-MM}", summary, path, status: "draft", domain: "reporting"}`. Ler-mesclar-escrever.

15. **Resumir para o usuário.** Um parágrafo: o que foi montado, com base em qual período de fechamento, os números principais (caixa, queima, runway, receita anual, MB%), quaisquer itens `A DEFINIR`, próximo passo (o usuário revisa; nunca enviar). Nunca postar, nunca enviar por e-mail.

## Saídas

- `investor-financials/{yyyy-qq}.md` (pacote completo, indexado em `outputs.json` como `investor-financials`)
- `investor-financials/metrics-{YYYY-MM}.md` (apenas no submodo, mesmo tipo em `outputs.json`)
- Espelho opcional no Google Docs (URL capturada no cabeçalho do `.md`)
