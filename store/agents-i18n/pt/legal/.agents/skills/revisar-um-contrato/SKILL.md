---
name: revisar-um-contrato
title: "Revisar um contrato"
description: "Eu leio um contrato que alguém te enviou e te digo o que ele contém. Escolha o nível de profundidade: um veredito rápido sobre se é seguro assinar, uma checagem rápida de NDA, ou um mapa cláusula por cláusula sem veredito. Cada cláusula que precisa de atenção recebe uma nota clara e, quando necessário, uma redação sugerida para contestar."
version: 1
category: Contratos
featured: yes
image: scroll
integrations: [googledocs, googledrive, notion, firecrawl]
---


# Revisar um Contrato

Uma skill para a primeira leitura de um contrato de contraparte. O parâmetro `mode` escolhe a profundidade. Disciplina compartilhada de extração estruturada de cláusulas e "nunca inventar um padrão de cláusula que não posso citar".

## Parâmetro: `mode`

- `full` , revisão completa de MSA / DPA / formulário de pedido: mapa de cláusulas + veredito Verde (aceitar) / Amarelo (contestação opcional) / Vermelho (redline obrigatório) por cláusula + resumo em linguagem simples + recomendação de aceitar / redline / desistir. Grava em `contract-reviews/{counterparty}-{YYYY-MM-DD}.md`.
- `nda-traffic-light` , checklist rápida de 6 dimensões para NDAs recebidos (prazo, mutualidade, definição de informação confidencial, ressalvas, jurisdição, aliciamento de funcionários disfarçado, devolução/destruição). Grava em `ndas/{counterparty-slug}-{YYYY-MM-DD}.md` com redlines específicos em cada item Vermelho.
- `clauses-only` , extração estruturada, sem veredito. Lê o contrato fornecido (arquivo / URL / colado), extrai as cláusulas que importam (prazo, rescisão, renovação, limite de responsabilidade, indenização, propriedade intelectual, lei aplicável, DPA, treinamento de IA, residência de dados, direitos de saída), grava um mapa legível em `clause-extracts/{counterparty}-{YYYY-MM-DD}.md`, atualiza `counterparty-tracker.json` com os campos principais.

O usuário nomeia o modo em português simples ("faça a checklist rápida disso", "só extraia as cláusulas", "revisão completa com veredito") → deduza. Ambíguo → faça UMA pergunta nomeando 3 opções.

## Quando usar

- Explícito: "revise esse contrato", "faça a checklist rápida dessa NDA", "isso pode ser assinado?", "o que tem nesse contrato", "extraia as cláusulas".
- Pedidos em português simples mapeiam para um `mode`: "revisa por completo esse contrato de cliente / MSA" / "esse MSA é seguro para assinar" → `full`; "checagem rápida nessa NDA" / "essa NDA está OK para assinar" → `nda-traffic-light`; "só me mostra as cláusulas" / "extraia as cláusulas, sem veredito" / "revisa a cláusula de propriedade intelectual" (rode `full` e comece pela seção de propriedade intelectual) → `clauses-only` ou `full` com foco em propriedade intelectual.
- Implícito: chamado por `sort-my-legal-inbox` quando detecta um MSA / NDA / DPA e encaminha para revisão. Encadeado com `plan-contract-pushback` quando a saída tiver algum item Vermelho.

## Campos do registro que eu leio

Lê `config/context-ledger.json` primeiro.

- `universal.legalContext` + `context/legal-context.md` , obrigatório. Fornece a entidade (checagem de compatibilidade de lei aplicável), contratos vigentes (comparação modelo vs mercado), riscos em aberto, postura de risco do fundador. Se `context/legal-context.md` estiver faltando, execute a skill `set-up-my-legal-info` primeiro (ou faça UMA pergunta pontual para avançar).
- `universal.posture.risk` , define o limite entre Amarelo e Vermelho. Postura `lean` aceita mais Amarelo, postura `conservative` vira Amarelos limítrofes em Vermelho.
- `domains.contracts.counterpartyStack` , se a contraparte estiver na pilha vigente, faça referência aos termos executados anteriormente.
- `domains.contracts.documentStorage` , para saber de onde ler o contrato (Google Drive, Dropbox, Notion).

Campo obrigatório faltando → faça UMA pergunta pontual com dica de modalidade (conectar Google Drive / colar o texto do contrato / URL para PDF público), grave, continue.

## Passos

1. **Leia o registro e o contexto jurídico.** Reúna os campos obrigatórios que faltam conforme acima. Grave de forma atômica.
2. **Obtenha o contrato.** Prioridade: armazenamento de documentos conectado (Google Drive) > URL + raspagem via Firecrawl > arquivo enviado > texto colado. Se só um PDF foi fornecido e nenhuma ferramenta de extração de texto estiver conectada → diga isso, peça uma versão com texto extraível.
3. **Descubra ferramentas via Composio.** Execute `composio search document-storage` / `composio search web-scrape` conforme necessário. Sem conexão + contrato é uma URL → peça ao usuário para colar o texto.
4. **Ramifique pelo `mode`.**
   - `full`: extraia o mapa de cláusulas (veja `clauses-only` abaixo), avalie cada cláusula contra o padrão de mercado para uma empresa em estágio de fundador solo:
     - **Verde** , aceitar como está escrito.
     - **Amarelo** , contestação opcional, mas não obrigatória.
     - **Vermelho** , redline obrigatório antes de assinar.
     Produza: resumo executivo (2-3 frases), tabela cláusula por cláusula (Cláusula | Texto da contraparte | Veredito | Motivo | Redline sugerido se Vermelho), recomendação geral (Aceitar / Redline / Desistir). Qualquer cláusula fora da zona de confiança (ressalva de propriedade intelectual incomum, estrutura de indenização complexa, adendo de proteção de dados fora do padrão) → sinalize `attorneyReviewRequired: true` e recomende encadear com `draft-a-legal-document` type=escalation-brief.
   - `nda-traffic-light`: rode a checklist de 7 dimensões:
     1. **Prazo** (indefinido = Vermelho, mais de 5 anos = Amarelo).
     2. **Mutualidade** (unilateral da parte maior = Amarelo, unilateral de nós se formos quem revela = Verde, Vermelho se não formos).
     3. **Definição de informação confidencial** (ampla demais = Vermelho, exclusão de informação já pública ausente = Vermelho).
     4. **Ressalvas** (cláusula de conhecimento residual = Vermelho, processo legal padrão + desenvolvimento independente = Verde).
     5. **Jurisdição** (estado da contraparte fora dos EUA = Amarelo, país fora dos EUA = Vermelho, Delaware / Califórnia / Nova York = Verde).
     6. **Aliciamento de funcionários disfarçado** (cláusula de não aliciar funcionários escondida na NDA = Vermelho; aponte explicitamente).
     7. **Devolução/destruição** (ausente = Amarelo, exigência de certificação em 30 dias = Amarelo, 5 dias = Vermelho).
     Escreva um redline específico para cada item Vermelho (não um genérico "vamos te mandar o nosso modelo"). Produza um resumo de um parágrafo + veredito + redlines.
   - `clauses-only`: sem veredito. Extraia cláusula por cláusula:
     - Partes, data de efetivação, prazo, renovação automática, período de aviso.
     - Condições de pagamento, tabela de taxas, tratamento tributário.
     - Rescisão (por conveniência, por justa causa, período de aviso).
     - Limite de responsabilidade (por reclamação / anual / ilimitado / super-limite).
     - Indenização (mútua / unilateral, ressalvas, processo).
     - Propriedade intelectual (produto do trabalho, cessão, propriedade intelectual preexistente, feedback).
     - DPA / tratamento de dados (mecanismo de transferência, subprocessadores, SCCs).
     - Treinamento de IA / uso de dados (opt-out explícito, direitos de treinamento).
     - Residência de dados, lei aplicável, foro de disputa, arbitragem.
     - Direitos de saída (devolução/destruição de dados, janela de transição).
     - Cessão, mudança de controle, repasses contratuais.
     Cada cláusula: texto da contraparte (citado) + paráfrase em linguagem simples + observação de "o que acompanhar" em uma linha (sem veredito).
5. **Atualize `counterparty-tracker.json`** (todo modo) , leia, combine e grave de forma atômica. Adicione ou atualize a linha da contraparte com os campos estruturais extraídos (tipo, prazo, renovação automática, período de aviso, lei aplicável, data de renovação se calculável).
6. **Grave o artefato de forma atômica** (`*.tmp` → renomear):
   - `full` → `contract-reviews/{counterparty-slug}-{YYYY-MM-DD}.md`.
   - `nda-traffic-light` → `ndas/{counterparty-slug}-{YYYY-MM-DD}.md`.
   - `clauses-only` → `clause-extracts/{counterparty-slug}-{YYYY-MM-DD}.md`.
7. **Adicione ao `outputs.json`** , leia, combine e grave de forma atômica: `{ id (uuid v4), type: "contract-review" | "nda-review" | "clause-extract", title, summary, path, status: "ready", domain: "contracts", createdAt, updatedAt, attorneyReviewRequired? }`.
8. **Resuma para o usuário.** Um parágrafo curto em linguagem simples: o veredito geral (ou "sem veredito" se for só extração) e o que mais chama atenção. Se algo for motivo para desistir do negócio, ofereça o próximo passo claramente: "Quer que eu planeje a contestação?" Nunca cite arquivos, caminhos, ou procedimentos internos.

## O que eu nunca faço

- Inventar um padrão de cláusula que não posso citar. "Padrão de mercado" incerto para o prazo → marque DESCONHECIDO, recomende revisão por advogado.
- Fornecer consultoria jurídica final. Toda revisão `full` inclui o aviso "esta é uma primeira leitura, revisão por advogado recomendada para cláusulas fora do rotineiro".
- Dar veredito sobre uma cláusula que na verdade não extraí. DPA mencionado mas não anexado → marque a seção do DPA como DESCONHECIDO.
- Fixar nomes de ferramentas no código, descoberta via Composio apenas em tempo real.
- Sobrescrever `counterparty-tracker.json` , sempre ler, combinar e gravar.

## Saídas

- `contract-reviews/{counterparty}-{YYYY-MM-DD}.md` (mode=full).
- `ndas/{counterparty-slug}-{YYYY-MM-DD}.md` (mode=nda-traffic-light).
- `clause-extracts/{counterparty}-{YYYY-MM-DD}.md` (mode=clauses-only).
- Atualiza `counterparty-tracker.json` (todo modo).
- Adiciona ao `outputs.json`.
