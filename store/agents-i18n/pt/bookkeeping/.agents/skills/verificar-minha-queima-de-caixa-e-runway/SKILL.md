---
name: verificar-minha-queima-de-caixa-e-runway
title: "Verificar minha queima de caixa e runway"
description: "Receba o resumo de uma página para fundadores: caixa disponível, queima líquida dos últimos 3 e 6 meses, meses de runway, uma tabela de sensibilidade de ±20%, e os 3 principais fatores de custo por trás da queima. Os saldos de caixa vêm do QuickBooks / Xero / seu feed bancário quando conectado, ou do extrato mais recente caso contrário. Cada número cita sua fonte: saldo bancário com carimbo de data e hora, linha da DRE com o caminho do arquivo, ids de lançamentos contábeis nos fatores de custo. Eu mostro os números e você decide onde cortar."
version: 1
category: Contabilidade
featured: yes
image: ledger
integrations: [quickbooks, xero]
---


# Verificar minha queima de caixa e runway

Resumo de uma página para fundadores. Caixa, queima (média móvel de 3 e 6 meses), meses de runway, sensibilidade de ±20%, e os três maiores fatores de custo por trás da queima. Cada número está ligado a uma fonte específica de saldo de caixa ou a uma linha específica da DRE, nada inventado, nenhum conselho sobre onde cortar.

## Quando usar

- "qual é o nosso runway" / "quantos meses de caixa".
- "atualize o relatório de queima" / "reconstrua a planilha de runway".
- "se aumentássemos a queima em 20%, como o runway muda".
- Chamado por `close-my-month` depois que a DRE fica pronta; também chamado por `prepare-my-investor-pack` para atualizar o bloco de runway.

## Conexões que preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **QuickBooks Online ou Xero** (contabilidade), fonte preferida para os saldos de caixa ao vivo por conta. Opcional, mas o relatório fica muito mais atualizado com isso conectado.
- **Feed bancário** (bancário com suporte da Plaid), alternativa / complemento quando a contabilidade não está em dia. Opcional.

Se nenhuma das duas estiver conectada, recorro ao extrato mais recente registrado, e depois peço para você colar os saldos atuais. Eu nunca bloqueio, mas os números mais atualizados vêm de uma conexão ao vivo.

## Informações que preciso

Eu leio primeiro o seu contexto contábil. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **Suas contas bancárias e cartões de crédito** - Obrigatório. Por quê: preciso da lista de contas de caixa para somar em um número de caixa atual. Se estiver faltando, pergunto: "Quais contas bancárias e cartões de crédito a empresa usa? Conectar o QuickBooks ou seu feed bancário é o jeito mais fácil."
- **Saldos de caixa atuais por conta** - Obrigatório. Por quê: caixa dividido pela queima é igual ao runway. Se estiver faltando, pergunto: "Qual é o saldo atual em cada conta? Se você puder conectar o QuickBooks ou o banco eu extraio; caso contrário, envie o extrato mais recente ou cole os saldos."
- **DREs mensais recentes (últimos 6 meses)** - Obrigatório. Por quê: define a queima líquida móvel de 3 e 6 meses. Se estiver faltando, pergunto: "Já fechamos os últimos meses? Se não, rode o fechamento mensal primeiro para que eu tenha números reais de queima, caso contrário eu recalculo a partir dos lançamentos contábeis."
- **Um plano de contas com sinalizações de caixa e de itens não recorrentes** - Obrigatório. Por quê: me diz quais contas tratar como caixa e quais despesas são não recorrentes versus contínuas. Se estiver faltando, pergunto: "Temos um plano de contas configurado? Se não, vamos elaborar um primeiro, leva só alguns minutos."

## Passos

1. **Ler o contexto.** Carregar `context/bookkeeping-context.md`, `config/context-ledger.json` (preciso de `domains.banks.accounts[]` para saber quais contas de caixa existem), `config/chart-of-accounts.json` (identificar quais contas são caixa / equivalentes de caixa). Anotar a data de hoje, define o nome do arquivo.

2. **Extrair os saldos de caixa atuais.** Para cada conta em `context-ledger.domains.banks.accounts[]`, buscar o saldo nesta ordem de prioridade:
   - **Aplicativo conectado**, QuickBooks Online / Xero / feed bancário via Composio. Descobrir a ferramenta certa em tempo de execução (`composio search accounting` / `composio search banking`). Executar pelo slug; nunca fixar nomes de ferramenta no código. Sem conexão ao vivo, dizer ao usuário qual categoria conectar, cair para a próxima fonte.
   - **Último extrato**, linha mais recente em `statements/{last4}/` ou saldo de fechamento do último `runs/{period}/run.json` que incluiu esta conta.
   - **Usuário cola**, fazer uma pergunta direcionada.

   Somar em `currentCash`. Registrar a fonte por conta mais o carimbo de data e hora para que o relatório seja auditável.

3. **Calcular a queima líquida móvel.** Ler as DREs dos últimos 6 meses em `financials/{YYYY-MM}/pnl.md` (ou recalcular na hora a partir de `journal-entries.json` se o mês estiver faltando):
   - **Queima líquida** = negativo do Lucro Líquido, excluindo itens não recorrentes sinalizados em `journal-entries.json` por `type in {"adjustment"}` e memo contendo `"one-time"` / `"true-up"`. Se existir demonstração de fluxo de caixa para o período, preferir seu fluxo operacional mais de investimento como medida de queima.
   - **Móvel de 3 meses**, média dos últimos 3 meses.
   - **Móvel de 6 meses**, média dos últimos 6 meses.
   Registrar ambos; o relatório mostra os dois para que o usuário veja a diferença de suavização.

4. **Construir um histórico de caixa de 12 meses.** Para cada um dos últimos 12 fechamentos de mês, calcular o caixa total (soma dos saldos das contas de caixa naquela data a partir de `journal-entries.json` mais o saldo de abertura). Dados do gráfico de runway: `cashHistory[]` = `[{monthEnd, totalCash}]`.

5. **Calcular o runway.**
   - `runway_3mo = currentCash / trailing_3mo_net_burn`
   - `runway_6mo = currentCash / trailing_6mo_net_burn`
   Queima líquida zero ou negativa (lucrativo), mostrar "infinito" para essa coluna e anotar. Mostrar os dois para que o usuário veja a sensibilidade à janela de suavização.

6. **Construir a tabela de sensibilidade.** Em cada um dos pontos `-20%`, `-10%`, `0%`, `+10%`, `+20%` da queima atual, calcular o runway usando a base móvel de 3 meses. Colunas: `burn_change_pct`, `implied_monthly_burn`, `runway_months`.

7. **Identificar os 3 principais fatores de custo.** A partir do detalhamento mais recente da DRE, agrupar as linhas de despesa por `statementSection` (por exemplo, `operating-expenses.headcount`, `operating-expenses.hosting`, `operating-expenses.marketing`) e escolher os três maiores por valor absoluto no mês móvel. Citar cada um com o caminho específico do arquivo da DRE mais os ids de lançamentos contábeis, caso o usuário queira se aprofundar.

8. **Sinalizar mudança de runway semana a semana.** Ler o `runway/*.md` anterior (mais recente pela data no nome do arquivo). Se o runway mudou mais de 10% em relação ao relatório anterior, colocar no topo do novo relatório uma sinalização em destaque com a diferença e a causa provável (mudança de queima versus mudança de saldo de caixa).

9. **Escrever o relatório.** Caminho: `runway/{YYYY-MM-DD}.md` (data de hoje). Escrita atômica: `.tmp` → renomear. Estrutura:
   - **Destaque**, 1 a 2 frases: `$X de caixa, $Y/mês de queima (3 meses), {runway} meses de runway`.
   - **Saldos de caixa**, tabela por conta com saldo mais fonte mais data de referência.
   - **Queima líquida**, móvel de 3 e 6 meses, itens não recorrentes excluídos (listá-los).
   - **Runway**, ambas as visões (3 e 6 meses).
   - **Histórico de caixa (12 meses)**, `cashHistory[]` em tabela; a interface a jusante pode transformar em gráfico.
   - **Tabela de sensibilidade**, cinco linhas de ±20%.
   - **3 principais fatores de custo**, cada um com valor, porcentagem das despesas operacionais, citação da fonte.
   - **Mudança semana a semana**, se aplicável, diferença sinalizada.
   - Rodapé: fontes (caminhos da DRE, caminho do context-ledger, fontes de saldo bancário mais carimbos de data e hora).

10. **Anexar a `outputs.json`.** Ler, mesclar, escrever. Linha:
    `{id, type: "burn-runway", title: "Burn & Runway -
    {YYYY-MM-DD}", summary: "<o destaque>", path:
    "runway/{YYYY-MM-DD}.md", status: "draft", domain:
    "reporting"}`.

11. **Resumir para o usuário.** Um parágrafo: caixa, queima (ambas as janelas móveis), runway (ambos), maior fator de custo, qualquer sinalização semana a semana. Apontar para o arquivo escrito. Nunca dar "conselho" sobre cortes, mostrar a matemática e deixar o fundador decidir.

## Saídas

- `runway/{YYYY-MM-DD}.md`
- Linha em `outputs.json`: `type: "burn-runway"`, `domain: "reporting"`, `status: "draft"` até o usuário aprovar.
