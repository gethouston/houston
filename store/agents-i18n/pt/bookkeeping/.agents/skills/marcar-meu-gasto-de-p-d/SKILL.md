---
name: marcar-meu-gasto-de-p-d
title: "Marcar meu gasto de P&D"
description: "Marco seu gasto qualificado de P&D para dar suporte à Seção 174 e ao crédito federal de P&D. Agrupo o gasto nas quatro categorias do IRS (salários qualificados por função do funcionário e proporção de tempo, suprimentos, locação de nuvem / computadores, pesquisa contratada a 65%), aloco entre seus projetos (ou um único grupo 'P&D não alocado' se não houver lista de projetos), e sinalizo as exclusões típicas (correções pós-lançamento, análises de rotina, pesquisa financiada por terceiros). Apenas um pacote de suporte, seu contador de impostos declara o Formulário 6765 e quaisquer equivalentes estaduais."
version: 1
category: Contabilidade
featured: no
image: ledger
---


# Marcar Meu Gasto de P&D

Suporte à Seção 174 e ao crédito de P&D para o ano fiscal. Eu agrupo o gasto qualificado nas quatro categorias do IRS, salários, suprimentos, locação de nuvem / computadores, pesquisa contratada a 65%, e aloco por projeto onde você tiver um. As exclusões (análises de rotina, trabalho pós-lançamento, pesquisa financiada, Gerais e Administrativas de P&D) são listadas com citações para que o seu contador de impostos possa auditar cada decisão. Somente suporte, eu nunca declaro o Formulário 6765.

## Quando usar

- "marque o gasto de P&D para o crédito" / "detalhamento da Seção 174" / "classifique as despesas de P&D de {ano}".
- Chamada pela habilidade `hand-off-to-my-tax-preparer` quando `domains.tax.rdCreditEligible == "yes"`.
- Antes da entrega de fim de ano, mostre marcações de projeto faltantes ou decisões incertas entre P&D e Gerais e Administrativas.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Provedor de folha de pagamento** (Gusto, Rippling, Justworks, Deel, ADP) - fonte preferida para os salários por funcionário e função, que orienta o grupo de salários qualificados. Obrigatório se você tiver funcionários.
- **QuickBooks Online ou Xero** (contabilidade) - complemento opcional para pagamentos a fornecedores e gasto com contratados se eu não conseguir vê-los no histórico de execuções.

Se não existir conexão de folha de pagamento e você tiver funcionários, eu paro e peço para você conectar sua ferramenta de folha de pagamento, ou enviar um CSV de resumo da folha de pagamento.

## Informações que eu preciso

Eu leio o seu contexto contábil primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **O ano fiscal que você está reivindicando** - Obrigatório. Por quê: define o intervalo de datas em que eu agrego o gasto. Se estiver faltando eu pergunto: "Para qual ano fiscal estamos classificando P&D?"
- **Elegibilidade ao crédito de P&D** - Obrigatório. Por quê: confirma se eu rodo um detalhamento no estilo do crédito federal ou apenas uma visão de amortização da Seção 174. Se estiver faltando eu pergunto: "A empresa está planejando reivindicar o crédito federal de P&D este ano, ou isto é só para a amortização da Seção 174?"
- **A função de cada funcionário e a proporção do tempo dele dedicada a P&D qualificado** - Obrigatório. Por quê: orienta o grupo de salários qualificados; engenheiros usam 100% por padrão, produto / design menos. Se estiver faltando eu pergunto: "O que cada pessoa da equipe faz, e aproximadamente qual proporção do tempo dela é engenharia ou pesquisa prática? Se preferir, eu começo com padrões (engenharia 100%, produto 50%, design 25%, outros 0%) e você corrige o que estiver errado."
- **Sua lista de projetos** - Opcional. Por quê: me permite alocar o gasto qualificado por projeto, que é o que o formulário do crédito pede. Se você não tiver isso, eu reúno tudo em um único grupo "P&D não alocado".
- **A proporção de P&D no seu gasto com hospedagem em nuvem** - Opcional. Por quê: empresas pré-receita geralmente tratam 100% da nuvem como P&D; empresas com receita dividem produção versus P&D. Se estiver faltando eu pergunto: "Quanto do seu gasto com AWS / GCP / Vercel é para desenvolvimento e pesquisa versus rodar o produto ao vivo? Se você não tiver isso, eu uso 100% de P&D como padrão pré-receita."

## Passos

1. **Ler o contexto.** Carregar `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Registro obrigatório: `universal.company`, `domains.payroll`, `domains.tax.rdCreditEligible`. Se `rdCreditEligible == "no"`, avisar mas prosseguir se o usuário confirmar (créditos estaduais / amortização da Seção 174 ainda usam este detalhamento).

2. **Determinar o ano fiscal.** Usar o ano do usuário se especificado; senão o ano corrente do rascunho em andamento.

3. **Mapa função → % de P&D (único, em cache).** Se `domains.payroll.rdWagePctByRole` estiver faltando, perguntar uma vez: padrões engenharia 100%, produto 50%, design 25%, não técnico 0%; o usuário sobrepõe. Escrever atomicamente.

4. **Lista de projetos (única, em cache).** Se `config/rd-projects.json` estiver ausente, pedir ao usuário uma linha por projeto (nome + descrição). Escrever `[{slug, name, description}]` atomicamente. Se recusado, usar um único grupo: "P&D não alocado".

5. **Extrair as transações qualificadas.** Ler cada `runs/*/run.json` cujo período se sobrepõe ao ano fiscal; também `journal-entries.json` para lançamentos contábeis feitos no ano (provisões de folha de pagamento, provisões de nuvem).

6. **Grupo 1 - Salários por serviços qualificados.** A partir de lançamentos contábeis de folha de pagamento (ou diretamente do Gusto / Rippling / Justworks via Composio): por funcionário, obter a função + os salários brutos, multiplicar pela % de P&D da função, somar. Citar cada linha pelo id do lançamento contábil + nome do funcionário. Excluir o tempo não técnico dos fundadores, funções Gerais e Administrativas, e toda remuneração em ações (somente salários).

7. **Grupo 2 - Suprimentos.** Transações sob `"supplies"` / `"rd-supplies"` do plano de contas. Típico para hardware / biotecnologia; geralmente $0 para SaaS puro. Materiais **consumidos** apenas em pesquisa, equipamento de capital passa pela depreciação.

8. **Grupo 3 - Locação de computadores / nuvem.** Percorrer as transações de contrapartes canônicas como `{AWS, Amazon Web Services, GCP, Azure, Digital Ocean, Linode, Vercel, Fly.io, Render, Netlify, Heroku, Cloudflare}` mais outras de `prior-categorizations.json` sob códigos de conta de nuvem/hospedagem. Perguntar ao usuário a proporção de P&D (padrão 100% pré-receita; empresas com receita dividem produção versus P&D). Guardar em cache em `domains.tax.cloudRdPct`.

9. **Grupo 4 - Pesquisa contratada a 65%.** Transações sob `"contractor"` / `"professional-services"` / `"consulting"` onde o fornecedor faz P&D qualificado (contratados de engenharia, consultores de pesquisa, prototipagem). O código limita a inclusão a 65% - `qualified = 0.65 * payment`. Citar cada transação.

10. **Alocar entre projetos.** Atribuir cada linha qualificada a um projeto:
    - Folha de pagamento: perguntar as divisões por pessoa (padrão: divisão igual entre projetos ativos). Guardar em cache por pessoa.
    - Nuvem: divisão igual por padrão, a menos que o usuário forneça marcações de custo por projeto.
    - Contratados: inferir da descrição da transação / memorando da fatura; recorrer à confirmação do usuário.
    - Suprimentos: inferir do pedido de compra / memorando se disponível.
    Linhas não alocadas caem em "P&D não alocado".

11. **Exclusões.** Destacar gastos que parecem P&D mas não são qualificados segundo o Treas. Reg. §1.41:
    - Coleta de dados de rotina (analytics de clientes, painéis de BI para operações).
    - Melhorias pós-lançamento comercial (correções menores de bugs, ajustes cosméticos de interface em funcionalidades já lançadas).
    - Pesquisa financiada (outra parte é dona dos resultados E assume o risco).
    - Duplicação de um componente de negócio existente.
    - Gestão / Gerais e Administrativas de P&D (tempo de gerenciamento de projeto que não é pesquisa qualificada).
    - Marketing, pesquisa de mercado, publicidade.
    Mostrar cada uma com citações + a regra invocada. Excluir do total qualificado. O usuário pode sobrepor.

12. **Escrever `compliance/rd-credit/{year}.md`.** Escrita atômica. Estrutura:
    - **Resumo** - gasto total qualificado de P&D; detalhamento por categoria + projeto. Um destaque: total de despesa de pesquisa qualificada.
    - **Detalhamento por projeto** - matriz projeto × categoria com totais de linha + coluna.
    - **Detalhe por categoria** - detalhe linha a linha por categoria (funcionário ou fornecedor, valor, alocação de projeto) com citações.
    - **Exclusões** - o que foi retirado, com citações + regra.
    - **Notas de decisões de julgamento** - premissas de % por função, % de P&D na nuvem, qualquer fornecedor incerto. O usuário decide; eu sinalizo as opções.
    - **Nota de declaração** - "Somente suporte. O contador de impostos declara o Formulário 6765 (federal) e quaisquer equivalentes estaduais. A capitalização da Seção 174 / amortização em 5 anos é um cálculo separado da declaração."

13. **Anexar a `outputs.json`.** Linha: `{type: "rd-classification", title: "Suporte ao crédito de P&D {year}", summary, path, status: "draft", domain: "compliance"}`. Ler-mesclar-escrever.

14. **Resumir para o usuário.** Um parágrafo: gasto total qualificado, totais por categoria, totais por projeto se os projetos estiverem definidos, contagem de decisões de julgamento, lembrete de que o contador de impostos declara o Formulário 6765, não eu.

## Saídas

- `compliance/rd-credit/{year}.md` (indexado como `rd-classification`)
- `config/rd-projects.json` (lista de projetos em cache, se fornecida)
- Atualizações no registro: `domains.payroll.rdWagePctByRole`, `domains.tax.cloudRdPct`, divisões de projeto por funcionário
