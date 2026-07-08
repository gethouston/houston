---
name: revisar-minhas-provisoes
title: "Revisar minhas provisões"
description: "Use quando disser 'liste nossas provisões ativas' / 'atualize o registro de provisões' / 'alguma provisão está vencida?' / 'quais lançamentos de reversão estão pendentes?'. Recalculo os saldos atuais de cada provisão ativa (aluguel antecipado, SaaS antecipado, receita diferida, PTO, folha de pagamento provisionada, juros provisionados), sinalizo os itens vencidos, e mostro os candidatos a lançamentos de reversão. Leio `accruals.json` + `journal-entries.json` + o plano de contas; reescrevo `accruals/register.md` e atualizo ou crio `accruals.json`."
version: 1
category: Contabilidade
featured: no
image: ledger
---


# Revisar Provisões

Registro vivo de cada provisão que os livros carregam. Cada execução recalcula os saldos a partir dos lançamentos contábeis subjacentes, classifica cada linha (`active` / `reversed` / `stale` / `written-off`), e mostra os candidatos a lançamentos de reversão do período atual. Registro é um documento vivo, reescrito no lugar, NÃO indexado em `outputs.json`.

## Quando usar

- "liste nossas provisões ativas" / "atualize o registro de provisões".
- "alguma provisão está vencida" / "algo que eu devesse reverter".
- "quais lançamentos contábeis de reversão estão pendentes este mês".
- Chamada pela habilidade `run-monthly-close` depois das conciliações, antes da habilidade `prep-journal-entry` disparar o lote de reversão.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Nenhuma conexão externa necessária.** Eu trabalho inteiramente a partir dos seus lançamentos contábeis existentes, do registro de provisões, e do plano de contas.

Esta habilidade nunca trava por causa de uma conexão faltante.

## Informações que eu preciso

Eu leio o seu contexto contábil primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **Um plano de contas com seções de despesa antecipada, diferido, provisionado, e PTO** - Obrigatório. Por quê: eu descubro novas provisões automaticamente varrendo essas seções da demonstração no plano de contas. Se estiver faltando eu pergunto: "Já temos um plano de contas? Se não, vamos elaborar um primeiro para que as linhas de provisão tenham um lugar."
- **Um contexto contábil finalizado** - Obrigatório. Por quê: preciso do seu método contábil e do período atual para calcular saldos e reversões. Se estiver faltando eu pergunto: "Já configuramos os livros? Se não, rode a configuração primeiro."
- **Um histórico atual de lançamentos contábeis** - Obrigatório. Por quê: eu recalculo o saldo de cada provisão a partir dos lançamentos contábeis que atingem o seu código de conta. Se estiver faltando eu pergunto: "Já processamos algum período? Se não, vamos rodar um fechamento primeiro para que existam lançamentos contábeis para calcular."

## Passos

1. **Ler o contexto.** Carregar `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Plano de contas faltando → parar, pedir ao usuário para rodar `build-chart-of-accounts` primeiro. Anotar a data de hoje + o período contábil atual (`YYYY-MM`).

2. **Ler o índice atual de provisões.** Carregar `accruals.json` na raiz do agente (array vazio se ausente). Esquema da linha: `{id, accrualName, glCode, currentBalance, reversing, lastActivity, status: "active" | "reversed" | "stale" | "written-off", notes, createdAt, updatedAt}`. Manter a lista em memória, indexada por `id`.

3. **Ler os lançamentos contábeis de apoio.** Carregar `journal-entries.json`, filtrar para lançamentos cujo `lines[].glCode` corresponde ao `glCode` de alguma provisão, ordenados por `date` crescente. Histórico de atividade usado para recalcular os saldos.

4. **Recalcular os saldos atuais.** Para cada linha de provisão ativa:
   - Somar todos os débitos e créditos de linhas de lançamentos contábeis contra o seu `glCode` desde o `createdAt` da linha.
   - Aplicar a convenção de sinal baseada no saldo natural do tipo de conta (ativo: débito-positivo; passivo/receita diferida: crédito-positivo).
   - Atualizar `currentBalance`. Atualizar `lastActivity` para a `date` máxima de lançamento contábil que atinge esse código de conta. Nenhum lançamento contábil → deixar `lastActivity` inalterado.

5. **Descobrir novas provisões.** Qualquer `glCode` que aparece em `chart-of-accounts.json` sob `statementSection` contendo `"prepaid"`, `"deferred"`, `"accrued"`, ou `"pto"`, mas sem linha em `accruals.json` → criar uma nova linha. Inferir `accrualName` a partir do nome da conta + memorando do primeiro lançamento contábil. `status: "active"`. Padrão `reversing: false` a menos que o lançamento contábil de origem tenha `reversing: true`.

6. **Classificar o status.**
   - `active` - `abs(currentBalance) > 0.00` E `lastActivity` dentro dos últimos 90 dias.
   - `stale` - `abs(currentBalance) > 0.00` E `lastActivity` mais antiga que 90 dias. Sinalizar como candidata a baixa ou reclassificação. Anotar a ação recomendada em `notes` ("considerar reclassificação para {X}" ou "candidata a lançamento contábil de baixa").
   - `reversed` - `abs(currentBalance) <= 0.01` E existe lançamento contábil de reversão referenciando a provisão original.
   - `written-off` - somente o usuário pode definir. Nunca transiciona automaticamente.

7. **Identificar candidatos a lançamento de reversão para o período atual.** A linha é candidata a reversão se:
   - `reversing: true` (a provisão original foi lançada como reversora), E
   - o status é `active`, E
   - o período atual é estritamente posterior ao período de origem da provisão, E
   - ainda não existe lançamento contábil de reversão para este `id`.

   Coletar em uma lista `reversing_candidates` com o valor de reversão sugerido (negativo do `currentBalance`) + id do lançamento contábil de origem.

8. **Reescrever `accruals/register.md`.** Documento vivo, sobrescrito no lugar. Estrutura:
   - **Resumo** - contagens por status, saldo total de despesas antecipadas, saldo total de receita diferida, saldo total de passivos provisionados.
   - **Provisões ativas** - uma linha por provisão ativa com `accrualName`, `glCode`, `currentBalance`, `lastActivity`, sinalizador `reversing`.
   - **Candidatos a lançamento de reversão deste período** - lista numerada com o memorando de lançamento contábil sugerido + valor; o usuário roda `prep-journal-entry type=accrual` para elaborar cada um.
   - **Provisões vencidas (mais de 90 dias sem atividade)** - tabela com a ação recomendada por linha.
   - **Revertidas recentemente** - as reversões do último período, para rastreabilidade.
   - **Baixadas** - histórico; manter os últimos 6 meses.

   Escrita atômica: `accruals/register.md.tmp` → renomear.

9. **Inserir/atualizar `accruals.json`.** Ler-mesclar-escrever:
   - Ler o arquivo atual.
   - Cada linha na lista recalculada: `id` corresponde → atualizar os campos mutáveis (`currentBalance`, `lastActivity`, `status`, `notes`, `updatedAt`). Novo `id` → anexar.
   - Preservar `createdAt` - nunca alterar.
   - Nunca descartar linhas que não aparecem mais no recálculo; marcar `written-off` somente se o usuário confirmar explicitamente.
   - Escrita atômica: `accruals.json.tmp` → renomear.

10. **NÃO anexar a `outputs.json`.** O registro é um documento vivo. `accruals.json` é um índice plano na raiz, não um entregável.

11. **Resumir para o usuário.** Um parágrafo: quantas provisões ativas / vencidas / candidatas a reversão neste período, saldo total em aberto, próximo passo exato (por exemplo, "2 lançamentos contábeis de reversão pendentes, rode `prep-journal-entry type=accrual` em cada um"). Nunca propor lançamento no razão geral; somente rascunhos.

## Saídas

- `accruals/register.md` (documento vivo, NÃO indexado em outputs.json)
- `accruals.json` (índice plano na raiz, inserido/atualizado, não sobrescrito)
