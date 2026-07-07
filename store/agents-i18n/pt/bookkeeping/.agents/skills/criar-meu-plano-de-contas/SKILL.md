---
name: criar-meu-plano-de-contas
title: "Criar meu plano de contas"
description: "Elaboro um plano de contas otimizado para startups, ajustado à sua entidade, método contábil e modelo de receita, com detalhamento de despesas operacionais de P&D / Vendas e Marketing / Gerais e Administrativas, linhas de receita diferida e PTO provisionado, linhas de notas SAFE e capital conversível, e uma sublinha de caixa para cada conta bancária registrada. Permite revisões no próprio documento que preservam todo código inalterado para que as categorizações históricas não sejam redirecionadas silenciosamente. Eu nunca envio o plano de contas para o QuickBooks ou Xero, você ou seu contador replicam lá."
version: 1
category: Contabilidade
featured: no
image: ledger
integrations: [hubspot, stripe, quickbooks, xero, notion, slack]
---


# Criar meu plano de contas

O plano de contas é o formato de toda demonstração financeira que eu produzo. Elaboro o seu com uma visão definida para startups em estágio inicial: visibilidade de P&D para o crédito, divisão entre Vendas e Marketing / Gerais e Administrativas para o enquadramento de margem bruta, linhas de passivo prontas para competência mesmo que você esteja no regime de caixa, e uma sublinha de caixa para cada conta bancária registrada para que as conciliações se encaixem com clareza. As revisões acontecem só aqui e preservam todo código inalterado.

Eu nunca envio o plano de contas para o QuickBooks ou Xero. Você ou seu contador replicam no sistema contábil.

## Quando usar

- "elabore nosso plano de contas" / "precisamos de um" / "ainda não
  temos um".
- "revise o plano de contas para destacar P&D" / "adicione uma linha de receita diferida" /
  "separe hospedagem do custo dos produtos vendidos".
- Chamado implicitamente por `import-my-prior-books` quando a exportação
  anterior inclui um plano de contas e o nosso está ausente.
- Chamado implicitamente por `process-my-statements` no Passo 1 se o plano de contas estiver ausente,
  mas só depois de confirmar diretamente.

## Conexões que preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **QuickBooks Online ou Xero** (contabilidade), opcional, me permite ler seu plano de contas existente no seu sistema contábil como ponto de partida.
- **Stripe** (cobrança), opcional, ajuda a confirmar como a receita e as taxas do processador fluem se você cobra através do Stripe.

Esta habilidade funciona totalmente offline com base no que você me diz. Nenhuma conexão bloqueia a execução, as conexões apenas tornam o primeiro rascunho mais preciso.

## Informações que preciso

Eu leio primeiro o seu contexto contábil. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **Seu tipo de entidade** - Obrigatório. Por quê: define a seção de patrimônio líquido (C-corp tem ações ordinárias / preferenciais / APIC; LLC tem capital de sócios). Se estiver faltando, pergunto: "Qual é o tipo de entidade, C-corp, S-corp, LLC, ou outro?"
- **Regime de caixa versus competência** - Obrigatório. Por quê: define se eu incluo linhas de receita diferida e PTO provisionado por padrão. Se estiver faltando, pergunto: "Estamos mantendo os livros no regime de caixa ou de competência?"
- **Suas contas bancárias e cartões** - Obrigatório. Por quê: crio uma sublinha de caixa por conta bancária para que as conciliações se encaixem com clareza. Se estiver faltando, pergunto: "Quais contas bancárias e cartões de crédito a empresa usa? Conectar o QuickBooks ou seu feed bancário é o jeito mais fácil."
- **Seu modelo de receita** - Obrigatório. Por quê: SaaS por assinatura, por uso, serviços, ou uma combinação muda quais linhas de receita eu incluo. Se estiver faltando, pergunto: "Como a empresa ganha dinheiro, assinaturas recorrentes, baseado em uso, serviços, ou uma combinação?"
- **Sua postura de remuneração em ações** - Opcional. Por quê: ISO / NSO / RSU aciona uma linha de despesa de remuneração em ações e uma linha de patrimônio APIC-SBC. Se estiver faltando, pergunto: "Vocês já concedem participação acionária a funcionários? Se ainda não tiver, eu continuo sem as linhas de remuneração em ações e as adicionamos depois."

## Passos

1. **Ler a configuração.** Carregar `config/context-ledger.json`. Campos
   obrigatórios para um bom primeiro rascunho de plano de contas:
   - `universal.company.entityType` (define a seção de patrimônio líquido, c-corp
     tem ações ordinárias + preferenciais + APIC; LLC tem capital de sócios).
   - `universal.accountingMethod` (regime só de caixa pode omitir receita diferida,
     linhas de PTO provisionado sob pedido, incluir por padrão para que a troca para
     competência seja sem atrito).
   - `domains.banks.accounts[]` (uma sublinha de Caixa por conta bancária,
     nomeada com os últimos 4 dígitos para que as conciliações se encaixem 1 para 1).
   - `domains.revenue.model` (modelo por uso ganha uma sublinha de Receita
     por Uso; serviços ganha Receita de Serviços separada da
     recorrente).
   - `domains.payroll.stockCompPosture` (postura diferente de "none" ganha
     linhas de despesa de remuneração em ações mais patrimônio APIC-SBC).

   Qualquer campo obrigatório ausente: fazer UMA pergunta direcionada
   (dica de modalidade: aplicativo conectado > arquivo > URL > colar), escrever
   atomicamente, continuar.

2. **Ler o plano de contas existente, se houver.** Se
   `config/chart-of-accounts.json` existir, carregá-lo. Esta execução é
   revisão, não reescrita. **Preservar todo código inalterado.**
   Propor as diferenças (adições / renomeações / reparentamentos) e confirmar com o usuário
   antes de escrever. Nunca reatribuir um código de um nome para um conceito
   diferente, isso redireciona silenciosamente cada transação histórica que
   correspondia ao código antigo.

3. **Montar o plano de contas otimizado para startups.** Usar a estrutura abaixo. Os códigos
   são strings, manter a ordenação numérica dentro de cada tipo para que os relatórios
   ordenem naturalmente.

   **Ativos (10000-19999)**
   - Caixa, uma sublinha por conta bancária a partir de
     `domains.banks.accounts[]`, nomeada `Caixa - {banco} {últimos4}`. Formato do código de
     conta: `1{nnnn}`. Adicionar a linha `Caixa - Stripe` se o Stripe estiver
     conectado como processador de pagamento.
   - Contas a receber.
   - Aluguel Antecipado, SaaS Antecipado, Seguro Antecipado (linhas separadas,
     amortizam em cronogramas diferentes).
   - Ativo Imobilizado (mais a Depreciação Acumulada pareada, ativo
     negativo, mostrado como linha de contrapartida).

   **Passivos (20000-29999)**
   - Contas a pagar.
   - Folha de Pagamento Provisionada, PTO Provisionado (separado da folha de
     pagamento, PTO impacta a linha de despesa ao longo do tempo, não na virada).
   - Despesas Provisionadas (genérico).
   - Receita Diferida, curto prazo (menos de 12 meses) mais longo prazo (mais de 12 meses) como
     linhas separadas para a divisão no balanço patrimonial.
   - Notas SAFE, Notas Conversíveis (linhas separadas, postura contábil
     diferente na conversão).
   - Imposto de Renda a Pagar.

   **Patrimônio Líquido (30000-39999)**
   - C-corp: Ações Ordinárias, Ações Preferenciais, APIC, APIC-SBC (se a
     postura de remuneração em ações for diferente de "none"), Lucros Acumulados.
   - LLC: Capital de Sócios, Retiradas de Sócios, Lucros Acumulados.
   - S-corp: Ações Ordinárias, APIC, Distribuições, Lucros Acumulados.

   **Receita (40000-49999)**
   - Receita Recorrente (receita mensal de assinatura / receita anual).
   - Receita Não Recorrente.
   - Receita por Uso (somente se `revenue.model ∈ {usage, mix}`).
   - Receita de Serviços (somente se `revenue.model ∈ {services, mix}`).
   - Contrapartida de receita: Reembolsos e Créditos (negativo).

   **Custo dos produtos vendidos (50000-59999)**
   - Hospedagem / Infraestrutura (AWS, GCP, Vercel).
   - Taxas de API de Terceiros (APIs cobradas por uso fazem parte do custo dos produtos vendidos, não
     das ferramentas de P&D).
   - Processamento de Pagamento (Stripe, taxas de cartão).
   - Suporte ao Cliente (se o tamanho da equipe for maior ou igual a 10 e a função de
     suporte existir).

   **Despesas operacionais (60000-79999)**, detalhamento com visão definida que torna o plano de contas
   útil para startups. Prefixos de seção da demonstração mantêm a DRE agrupada:

   - **P&D** (60000-64999), Salários de P&D, Contratados de P&D,
     Software de P&D, Nuvem de P&D (dev/staging, separado da hospedagem do custo dos produtos vendidos),
     Outros de P&D. `statementSection: "operating-expenses.rd"`.
   - **Vendas e Marketing** (65000-69999), Salários de Vendas e Marketing, Publicidade, Eventos e
     Patrocínios, Ferramentas de Vendas e Marketing (HubSpot, Apollo, etc.), Outros de Vendas e Marketing.
     `statementSection: "operating-expenses.sm"`.
   - **Gerais e Administrativas** (70000-79999), Salários de Gerais e Administrativas, Jurídico, Contabilidade, Aluguel,
     Seguro, SaaS de Gerais e Administrativas (Slack, Notion, 1Password, etc.), Material de
     Escritório, Viagens e Refeições, Outros de Gerais e Administrativas.
     `statementSection: "operating-expenses.ga"`.

   **Outros (80000-89999)**, abaixo da linha.
   - Receita de Juros, Despesa de Juros.
   - Ganho / Perda Cambial.
   - Ganho / Perda na Baixa de Ativo Imobilizado.

   **Suspenso (99999)**, `statementSection:
   "operating-expenses.ga"` para ficar visível na DRE. Corresponde ao
   `universal.suspenseCode` do registro.

4. **Esquema.** Cada linha:

   ```ts
   {
     code: string;             // ALWAYS a string, never a number
     name: string;
     type: "asset" | "liability" | "equity" | "revenue" | "cogs" | "expense";
     parent?: string;          // code of the parent row for grouped display
     statementSection: string; // e.g. "operating-expenses.rd", "assets.current"
     description?: string;     // one-line disambiguation for categorizers
   }
   ```

5. **Validar antes de escrever.**
   - Todo `code` é string e único em todo o plano de contas.
   - Os códigos ordenam numericamente dentro de cada `type` (nenhum 60500 entre
     65000 e 65500, manter as faixas limpas).
   - Todo `type` tem pelo menos uma linha (nenhuma seção vazia).
   - Todo `parent` (se definido) resolve para uma linha no plano de contas.
   - Todo `statementSection` é uma das seções permitidas:
     `assets.current`, `assets.noncurrent`, `liabilities.current`,
     `liabilities.noncurrent`, `equity`, `revenue`,
     `contra-revenue`, `cogs`, `operating-expenses.rd`,
     `operating-expenses.sm`, `operating-expenses.ga`, `other`.

6. **Escrever atomicamente.** Escrever `config/chart-of-accounts.json.tmp`,
   depois renomear. Atualizar
   `config/context-ledger.json → universal.coa` com
   `{present: true, path: "config/chart-of-accounts.json", framework,
   lastUpdatedAt}` (ler, mesclar, escrever).

7. **Salvaguarda de revisão.** Se for revisão:
   - Comparar com o plano de contas anterior. Para qualquer código **removido**, verificar
     `config/prior-categorizations.json` e avisar se algum fornecedor
     ainda mapeia para aquele código, o usuário precisa remapear os fornecedores ou manter
     o código.
   - Para qualquer código **renomeado** (mesmo código, nome diferente), atualizar
     o `name` no lugar, as categorizações vinculadas ao `code` continuam seguras.
   - Para qualquer código **recém-adicionado**, registrar no resumo voltado ao usuário para que o
     fundador saiba que ele existe para a próxima execução.

8. **NÃO anexar a `outputs.json`.** O plano de contas é configuração, não
   entrega.

9. **Resumir para o usuário.** Contagens por tipo, quaisquer adições / renomeações /
   avisos, próximo passo ("solte os extratos em
   `statements/_inbox/` e eu categorizo com base neste plano de contas").

## Saídas

- `config/chart-of-accounts.json`, plano de contas oficial, esquema conforme o
  Passo 4.
- `config/context-ledger.json`, `universal.coa` atualizado
  (ler, mesclar, escrever).

Nenhuma entrada em `outputs.json`.
