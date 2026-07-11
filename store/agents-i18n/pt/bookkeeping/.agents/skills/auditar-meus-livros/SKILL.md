---
name: auditar-meus-livros
title: "Auditar meus livros"
description: "Receba uma lista de verificação sobre se seus livros estão em ordem: itens sem categorizar, diferenças de conciliação, provisões vencidas, candidatos a corte de período, lançamentos contábeis em rascunho, saldos de abertura ausentes, fornecedores duplicados. Eu classifico os problemas pelo impacto em dólares e aponto uma ação para 'resolver esta semana'. O submodo `mode=audit-response` para solicitações de auditor ou de diligência prévia monta um pacote de resposta com amostra rastreável e sementes aleatórias documentadas para que o auditor possa reproduzir a seleção. Eu nunca lanço nem apresento nada."
version: 1
category: Contabilidade
featured: no
image: ledger
---


# Auditar meus livros

Verificação de saúde para saber se os livros estão em ordem. Eu percorro todo índice plano na raiz e todo registro vivo, classifico os achados pelo impacto em dólares, e aponto a única coisa mais útil para resolver esta semana. O submodo `mode=audit-response` cuida de solicitações de auditor ou de diligência prévia com sementes aleatórias documentadas. Somente rascunhos, nunca lançado, nunca apresentado.

## Quando usar

- "os livros estão em ordem" / "o que está sem categorizar" / "verificação de saúde dos livros" / "lista de pendências".
- Chamado por `hand-off-to-my-tax-preparer` como etapa de bloqueio, os itens em aberto precisam ser resolvidos antes que a entrega prossiga.
- `mode=audit-response`, "responda a esta solicitação de auditoria" / "a diligência quer amostras do segundo trimestre" / "guie o auditor pelo reconhecimento de receita".

## Conexões que preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Nenhuma conexão externa é necessária.** Eu trabalho inteiramente a partir dos seus livros existentes, arquivos de conciliação, provisões e lançamentos contábeis. Para `mode=audit-response`, se você quiser que eu espelhe o pacote de documentos em uma pasta compartilhada, conecte o Google Drive (opcional).

Esta habilidade nunca fica bloqueada por falta de conexão. Os pacotes de documentos usam pastas locais por padrão, o espelho no Drive é um extra bem-vindo.

## Informações que preciso

Eu leio primeiro o seu contexto contábil. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **Um contexto contábil finalizado e um plano de contas** - Obrigatório. Por quê: eu ancoro a varredura no seu método contábil, código de suspenso e contas registradas. Se estiver faltando, pergunto: "Já configuramos os livros? Se não, rode a configuração uma vez para que eu saiba seu ano fiscal, método contábil e contas registradas antes de procurar problemas."
- **Um histórico de execução atual** - Obrigatório. Por quê: preciso de pelo menos um período categorizado para comparar. Se estiver faltando, pergunto: "Você já processou algum extrato? Envie seus extratos bancários ou de cartão de crédito mais recentes e eu trabalho a partir daí."
- **Sua solicitação de auditor ou de diligência prévia, no `mode=audit-response`** - Obrigatório para esse modo. Por quê: eu não consigo amostrar nem montar sem o pedido de fato. Se estiver faltando, pergunto: "Cole ou envie a solicitação do auditor ou da equipe de diligência, idealmente o e-mail completo ou o PDF com os itens que eles querem."

## Passos

1. **Ler o contexto.** Carregar `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Anotar a data de hoje como data de execução.

2. **Carregar os índices.** Ler `suspense.json`, `recon-breaks.json`, `accruals.json`, `journal-entries.json`, `outputs.json`, `run-index.json` (todos planos na raiz do agente).

3. **Sem categorizar / suspenso.** A partir de `suspense.json`, todo item aberto com idade (hoje menos createdAt). Agregar pela contraparte canônica. Apresentar o saldo total em suspenso mais as faixas de vencimento (0 a 30, 31 a 60, 61 a 90, mais de 90 dias).

4. **Diferenças de conciliação.** A partir de `recon-breaks.json`, toda diferença aberta com `abs(amount) > $100` E idade maior que 30 dias. Citar `reconciliations/{account_last4}/{YYYY-MM}.md`.

5. **Provisões vencidas.** A partir de `accruals.json`, linhas em que `status == "stale"` OU `lastActivity > 90 days` E `abs(currentBalance) > 0`. Incluir a ação recomendada já escrita por `review-my-accruals`.

6. **Candidatos a corte de período.** Percorrer os `journal-entries.json` recentes mais as transações do último fechamento:
   - Despesas datadas no período anterior mas lançadas no período atual (corte perdido).
   - Transações do período atual lançadas no período anterior (possível reversão de corte).
   Listar cada uma com id do lançamento contábil, valor, diferença de período.

7. **Lançamentos contábeis em rascunho travados.** A partir de `journal-entries.json`, lançamentos com `status == "draft"` E `updatedAt > 14 days`. Citar `id`, `date`, `memo`, valor total.

8. **Lacunas de saldo de abertura.** Comparar os códigos de conta usados nas execuções recentes com `config/opening-trial-balance.json`. Qualquer código presente nas execuções mas ausente no balancete de abertura, sinalizar (provável conta nova sem saldo de abertura, ou código que não deveria estar em uso).

9. **Fornecedores duplicados.** A partir das chaves de `config/prior-categorizations.json`, agrupar nomes canônicos com token-set-ratio maior ou igual a 0,85. Incluir o código de conta de cada variante, se forem diferentes, sinalizar como alta prioridade.

10. **Classificar pelo impacto em dólares.** Pontuar cada achado pelo valor absoluto em dólares afetado. Ordenar decrescente. O item do topo se torna o destaque de "item mais útil para resolver esta semana".

11. **Escrever `audits/{YYYY-MM-DD}.md`.** Escrita atômica. Estrutura:
    - **Resolver esta semana**, um item, maior impacto, com ação recomendada.
    - **Contagens resumidas**, suspenso, diferenças de conciliação, provisões vencidas, candidatos a corte de período, lançamentos em rascunho travados, lacunas de saldo de abertura, candidatos a fusão de fornecedor.
    - **Achados classificados por impacto em dólares**, citação (id do lançamento contábil, id do suspenso, caminho da conciliação), valor, ação recomendada, tempo estimado de resolução.
    - **Decisões de julgamento**, posições que exigem a decisão do usuário (por exemplo, "baixar $420 de aluguel antecipado vencido? [baixa | reclassificar | deixar]") com opções, nunca uma decisão.

12. **Anexar a `outputs.json`.** Linha: `{type: "books-audit", title: "Books health check {YYYY-MM-DD}", summary, path, status: "draft", domain: "reporting"}`. Ler, mesclar, escrever.

13. **Ramo `mode=audit-response`.** Pular os passos 3 a 11 de varredura. Em vez disso:
    a. **Analisar a solicitação.** O usuário fornece o pedido do auditor (colar / arquivo / URL). Dividir em itens discretos: seleções de amostra, roteiros, solicitações de documentos.
    b. **Seleções de amostra.** Para "extraia N amostras de {type}":
       - Semente determinística: `seed = "{YYYY-MM-DD}-{item-slug}"`. Documentar na saída.
       - Filtrar a população pelos critérios (período, código de conta, faixa de valor).
       - Ordenar de forma determinística (por `id` crescente).
       - Semear o gerador de números pseudoaleatórios para escolher N índices, por exemplo, `random.Random(seed).sample(range(len(pop)), N)`.
       - Exportar a amostra mais a semente usada (o auditor pode reproduzir).
    c. **Roteiros.** Resumir a partir de `context/bookkeeping-context.md` mais as saídas de habilidades relevantes. Citar as saídas de habilidade pelo caminho. Nunca inventar detalhe de processo.
    d. **Solicitações de documentos.** Montar os documentos em `handoffs/audit-{yyyy-qq}/{request-slug}/` (criar a subpasta se não existir). Incluir `README.md` listando cada arquivo mais o caminho de origem.
    e. **Decisões de julgamento.** Sinalizar posições que exigem decisão (limites de materialidade, linguagem de continuidade operacional, divulgação de segmento) com opções, o usuário decide. Nunca responder em nome do usuário.
    f. **Memorando de capa.** Escrever em `audits/{YYYY-MM-DD}-response-{request-slug}.md` listando cada item, status de resposta, caminhos de arquivo, sementes usadas. Anexar a `outputs.json` como `books-audit` com título `"Audit response {request-slug}"`.

14. **Resumir para o usuário.** Um parágrafo: principal achado mais impacto em dólares, contagens por categoria, um único próximo passo recomendado. Modo de resposta: itens respondidos / pendentes, localização do pacote, decisões de julgamento não resolvidas.

## Saídas

- `audits/{YYYY-MM-DD}.md` (verificação de saúde, indexada como `books-audit`)
- `audits/{YYYY-MM-DD}-response-{request-slug}.md` (modo de resposta)
- `handoffs/audit-{yyyy-qq}/{request-slug}/` (pacotes de documentos para o modo de resposta)
