---
name: redigir-um-documento-juridico
title: "Redigir um documento jurídico"
description: "Redijo um documento jurídico para você, como um NDA, um contrato com cliente, uma carta de oferta, uma política de privacidade, termos de serviço, uma decisão do conselho, uma resposta a uma solicitação de dados de cliente ou um resumo para enviar a um advogado de verdade. Eu trabalho a partir dos seus modelos existentes, se eu os tiver, ou com redação padrão de mercado com uma nota clara. Apenas rascunhos, nunca enviados ou assinados."
version: 1
category: Redação
featured: yes
image: scroll
integrations: [googledocs, googledrive, notion, firecrawl]
---


# Redigir um Documento Jurídico

Uma skill para toda necessidade de primeiro rascunho do fundador. O parâmetro `type` escolhe o modelo, a estrutura e as citações. Disciplina compartilhada de "apenas rascunhos, nunca enviar / registrar / assinar".

## Parâmetro: `type`

**Documentos comerciais (lê a biblioteca de modelos primeiro):**

- `nda` , NDA bilateral ou unilateral ancorado no seu modelo.
- `consulting` , contrato de consultoria / prestador de serviço ancorado em CIIAA + entregáveis + prazo.
- `offer-letter` , carta de oferta de emprego ancorada em 409A + remuneração + vesting + linguagem at-will.
- `msa` , contrato-guarda-chuva de prestação de serviços voltado ao cliente.
- `order-form` , formulário de pedido vinculado a um MSA existente.
- `board-consent` , consentimento escrito do conselho (rotina: nomeação de diretor, concessão de opções, adoção de 409A, resoluções bancárias).

**Privacidade / política:**

- `privacy-policy` , Política de Privacidade completa com divulgação de treinamento de IA, SCCs, lista de subprocessadores, citações de base legal.
- `tos` , Termos de Serviço (uso, propriedade intelectual, uso aceitável, limite de responsabilidade, foro de disputa).

**Resposta regulatória:**

- `dsr-response` , pacote de primeiro contato para solicitação de dados sob GDPR Art. 15 / CCPA: confirmação de recebimento + pedido de verificação de identidade + nota de encaminhamento da exportação (3 arquivos).

**Escalonamento:**

- `escalation-brief` , resumo estruturado para o advogado externo: resumo do assunto em 2-3 frases, perguntas específicas para o advogado, trechos citados com referência, prazo, tipo de escritório recomendado (societário / contencioso comercial / privacidade / propriedade intelectual / trabalhista). Nunca nomeia escritórios específicos.

O usuário nomeia o tipo em português simples ("redija um NDA com a Acme", "escreva nossa política de privacidade", "empacote isso para o advogado") → deduza. Ambíguo → faça UMA pergunta nomeando 10 opções agrupadas por categoria.

## Quando usar

- Explícito: "redija {tipo}", "escreva nossa política de privacidade", "responda a essa solicitação de dados", "escale isso para o advogado".
- Pedidos em português simples mapeiam para um `type`: "redija um NDA para {contraparte}" → `nda`; "redija um contrato de prestador / consultoria" → `consulting`; "redija um contrato com cliente" / "MSA para {cliente}" / "formulário de pedido" → `msa` ou `order-form`; "redija um consentimento do conselho" / "decisão do conselho para {ação}" → `board-consent`; "redija / atualize nossa política de privacidade" → `privacy-policy`; "redija nossos termos de serviço" → `tos`; "um cliente pediu os dados dele" / "responda a uma solicitação de dados / GDPR / CCPA" → `dsr-response`; "empacote isso para um advogado" / "prepare uma passagem de bastão para um advogado externo" / "passagem de marca registrada para um advogado" → `escalation-brief`.
- Implícito: encadeado a partir de `review-a-contract` quando a saída recomenda um contra-rascunho (o tipo é escolhido pelo tipo do contrato); a partir de `audit-compliance` (scope=privacy-posture) quando a auditoria diz que a política está desatualizada; a partir de `plan-contract-pushback` quando o redline precisa de um texto de cláusula específico redigido.

## Campos do registro que eu leio

Lê `config/context-ledger.json` primeiro.

- `universal.legalContext` + `context/legal-context.md` , obrigatório para todos os tipos (entidade, cap table, contratos vigentes, pilha de modelos, riscos em aberto, postura de risco). Se estiver faltando → execute a skill `set-up-my-legal-info` primeiro (ou faça UMA pergunta pontual para avançar).
- `universal.company` , nome, estágio (calibração de linguagem para todos os tipos).
- `universal.entity` , obrigatório para `offer-letter` (estado de constituição, ações emitidas), `board-consent` (ações autorizadas, diretores, executivos), `escalation-brief` (retrato da entidade).
- `domains.contracts.templateLibrary` , se apontar para um conjunto de modelos → ancore o rascunho ali. Se estiver faltando para tipos comerciais → faça UMA pergunta: cole a URL do modelo, conecte o Google Drive, ou prossiga com redação padrão de mercado com o aviso "nenhum modelo encontrado, usando redação padrão de mercado" carimbado no rascunho.
- `domains.compliance.landingPageUrl` , obrigatório para `privacy-policy` e `tos` (raspagem via Firecrawl para inferir a superfície do produto, a coleta de dados, o analytics).
- `domains.compliance.dataGeography` , obrigatório para `privacy-policy` e `dsr-response` (a presença da UE aciona SCCs + os prazos do GDPR Art. 15).
- `subprocessor-inventory.json` , obrigatório para `privacy-policy` (lista de fornecedores + status do DPA).
- `universal.posture.escalationThreshold` , obrigatório para `escalation-brief` (define o enquadramento de "por que precisamos de um advogado").

## Passos

1. **Leia o registro e o contexto jurídico.** Reúna os campos obrigatórios que faltam conforme acima. Grave de forma atômica.
2. **Descubra ferramentas via Composio** apenas quando o tipo precisar de uma: `googledocs` / `notion` para cópia espelhada (opcional), `googledrive` para ler a biblioteca de modelos, `firecrawl` para raspagem da landing page (privacy-policy, tos).
3. **Ramifique pelo `type`.**
   - `nda` / `consulting` / `offer-letter` / `msa` / `order-form` / `board-consent`: carregue o modelo correspondente da biblioteca (ou use redação padrão de mercado com o carimbo de aviso). Colete as variáveis (contraparte, datas, condições comerciais, nome do candidato, tamanho da concessão, cliff de vesting, o que se aplicar). Substitua as variáveis. Produza o rascunho com um bloco de comentário no topo listando (a) as variáveis substituídas, (b) as variáveis que precisam de confirmação do fundador. Estrutura de remuneração (offer-letter) ou matemática de participação (board-consent) fora do padrão → sinalize `attorneyReviewRequired: true`.
   - `privacy-policy` / `tos`: raspe a landing page via Firecrawl, faça referência cruzada com `subprocessor-inventory.json`, identifique as superfícies de coleta de dados (formulários, analytics, cookies, pagamento), escolha as seções certas (Coleta / Uso / Divulgação / Retenção / Direitos / Transferências / Segurança / Alterações / Contato para privacidade; Uso / Conta / Propriedade Intelectual / Uso Aceitável / Pagamento / Rescisão / Garantia / Responsabilidade / Disputas para os Termos de Serviço). Cite os artigos da GDPR para geografias que incluem a UE, a CCPA/CPRA para os EUA. Divulgação de treinamento de IA explícita (opt-in ou opt-out, declare qual é). Produza um rascunho em markdown dividido por seções.
   - `dsr-response`: calcule o prazo legal (GDPR Art. 15 → 30 dias, CCPA → 45 dias). Produza três arquivos: `acknowledgment.md` (recebido, início do prazo, retorno esperado, sem compromissos além do prazo legal), `identity-verification.md` (o que precisamos para confirmar que é a pessoa), `export-cover-note.md` (nota de encaminhamento modelo; a exportação de dados em si está fora do escopo, o fundador faz a exportação). Se o prazo já estiver a menos de 7 dias do vencimento legal → sinalize `attorneyReviewRequired: true`. Grave como pasta `dsr-responses/{request-id}-{YYYY-MM-DD}/`.
   - `escalation-brief`: resumo estruturado nesta ordem , (1) O assunto em 2-3 frases, (2) Perguntas específicas para o advogado (numeradas, delimitadas), (3) Prazo + motivo, (4) Trechos citados com referência (cláusula de contrato, e-mail, lei), (5) Retrato da entidade a partir de `universal.entity`, (6) Tipo de escritório recomendado (societário / contencioso comercial / privacidade / propriedade intelectual / trabalhista, sem nomes de escritórios), (7) O que aceitaríamos como resultado.
4. **Grave o rascunho de forma atômica** (`*.tmp` → renomear):
   - Tipos comerciais → `drafts/{type}/{counterparty-or-candidate}-{YYYY-MM-DD}.md`.
   - `privacy-policy` → `privacy-drafts/privacy-policy-{YYYY-MM-DD}.md`.
   - `tos` → `privacy-drafts/tos-{YYYY-MM-DD}.md`.
   - `dsr-response` → `dsr-responses/{request-id}-{YYYY-MM-DD}/` (pasta com três arquivos).
   - `escalation-brief` → `escalations/{matter-slug}-{YYYY-MM-DD}.md`.
5. **Espelho opcional no Google Docs.** `googledocs` conectado → ofereça espelhar o rascunho (a skill descobre a ferramenta em tempo real, o usuário confirma, o espelho é criado com um link de volta no rodapé do artefato).
6. **Adicione ao `outputs.json`** , leia, combine e grave de forma atômica: `{ id, type: "draft" | "privacy-policy" | "tos-draft" | "dsr-response" | "escalation-brief", title, summary, path, status: "draft", domain: "contracts" (comercial) | "compliance" (privacidade/dsr) | "entity" (board-consent) | "advisory" (escalation-brief), createdAt, updatedAt, attorneyReviewRequired? }`.
7. **Resuma para o usuário.** Uma mensagem curta em linguagem simples: o que você redigiu, que é um rascunho para revisão (não assinado/enviado), e se um advogado de verdade deveria olhar. Nunca mencione nomes de arquivos, caminhos, ou o procedimento interno.

## O que eu nunca faço

- Enviar, registrar, publicar, ou solicitar assinatura em qualquer rascunho. O fundador entrega, publica, ou empacota para o advogado. Todo artefato abre com o carimbo de uma linha "RASCUNHO , NÃO PARA ASSINATURA / NÃO PARA PUBLICAÇÃO".
- Inventar cláusula, lei, ou precedente que não posso citar.
- Nomear escritórios de advocacia específicos no `escalation-brief`. Apenas o tipo de escritório.
- Fazer compromissos de prazo no `dsr-response` além do prazo legal, as datas citadas são legais, não promessas.
- Fixar nomes de ferramentas no código, descoberta via Composio apenas em tempo real.
- Pular `attorneyReviewRequired: true` em anomalias de estrutura de remuneração, anomalias de matemática de participação, ou lacunas de DPA.

## Saídas

- `drafts/{type}/{slug}-{YYYY-MM-DD}.md` (tipos comerciais).
- `privacy-drafts/privacy-policy-{YYYY-MM-DD}.md` / `tos-{YYYY-MM-DD}.md`.
- `dsr-responses/{request-id}-{YYYY-MM-DD}/` (pasta com 3 arquivos).
- `escalations/{matter-slug}-{YYYY-MM-DD}.md`.
- Adiciona ao `outputs.json`.
