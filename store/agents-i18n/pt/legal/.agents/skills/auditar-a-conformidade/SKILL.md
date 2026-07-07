---
name: auditar-a-conformidade
title: "Auditar a conformidade"
description: "Verifique se a sua conformidade jurídica continua em dia. Escolha o que revisar: sua política de privacidade, sua lista de fornecedores de privacidade ou seus modelos de contrato. Eu mostro o que ficou desatualizado ou fora do padrão e o que corrigir. Eu nunca mudo nada por conta própria."
version: 1
category: Conformidade
featured: yes
image: scroll
integrations: [googledocs, googledrive, stripe, firecrawl]
---


# Auditar a Conformidade

Uma skill para todas as checagens de conformidade em regime permanente. O parâmetro `scope` escolhe qual inventário percorrer. Disciplina compartilhada de "diferenças, não correções" e "toda descoberta cita uma autoridade".

## Parâmetro: `scope`

- `privacy-posture` , raspa a landing page e o produto via Firecrawl, cruza com a Política de Privacidade publicada, sinaliza divergências (nova ferramenta de analytics não divulgada, subprocessador adicionado sem atualização de política, novo cookie, mudança de finalidade) com gravidade e atualização recomendada. Grava em `privacy-audits/{YYYY-MM-DD}.md`.
- `subprocessors` , percorre as integrações conectadas e os fornecedores inferidos a partir da raspagem da landing page, captura papel, categorias de dados, mecanismo de transferência, status do DPA e URL pública do DPA. Lê, combina e grava `subprocessor-inventory.json` na raiz do agente + um relatório de mudanças de uma página em `subprocessor-reviews/{YYYY-MM-DD}.md`.
- `template-library` , lê `domains.contracts.templateLibrary`, sinaliza modelos com mais de 12 meses, verifica cada um contra referências legais atuais (divulgação de treinamento de IA, versões das SCC, padrões de DPA de 2026, expansões de direitos CA/UE). Grava um plano de atualização em `template-reviews/{YYYY-MM-DD}.md`. Nunca reescreve automaticamente, o fundador aprova cada item, aciona `draft-a-legal-document` para reescrever.

Se o usuário nomear o escopo em português simples ("audita minha privacidade", "atualiza os modelos", "atualiza a lista de subprocessadores") → deduza. Ambíguo → faça UMA pergunta nomeando 3 opções.

## Quando usar

- Explícito: "audita minha postura de privacidade", "atualiza minha lista de subprocessadores", "atualiza minha biblioteca de modelos", "o que ficou desatualizado", "o que está velho".
- Pedidos em português simples mapeiam para um `scope`: "minha política de privacidade ainda está atual" / "minha política de privacidade bate com o que a gente realmente faz" → `privacy-posture`; "atualiza minha lista de fornecedores de privacidade" / "a gente adicionou novas ferramentas que tocam dados de clientes" → `subprocessors`; "meus modelos de contrato ainda estão atuais" / "algum modelo com mais de um ano que eu deveria atualizar" → `template-library`.
- Implícito: cadência mensal agendada (privacy-posture, subprocessors); novo fornecedor adicionado (subprocessors); nova superfície de landing page publicada (privacy-posture); biblioteca de modelos referenciada com mais de 12 meses em qualquer outra skill (template-library).

## Campos do registro que eu leio

Leia `config/context-ledger.json` primeiro.

- `universal.legalContext` + `context/legal-context.md` , obrigatório. Fornece o retrato da entidade, a postura de risco, a pilha de modelos existente (âncora para o escopo template-library). Se estiver faltando → execute a skill `set-up-my-legal-info` primeiro (ou faça UMA pergunta pontual para avançar).
- `universal.company.website` , obrigatório para `privacy-posture` e `subprocessors` (URL da landing page para o Firecrawl).
- `domains.compliance.landingPageUrl` , mais específico que `universal.company.website` se forem diferentes; recai sobre o website se ausente.
- `domains.compliance.deployedPolicies.privacyPolicyUrl` , obrigatório para `privacy-posture` (documento contra o qual comparar).
- `domains.compliance.dataGeography` , determina se os controles de subprocessador específicos da UE (SCCs, mecanismo de transferência) se aplicam.
- `domains.contracts.templateLibrary` , obrigatório para `template-library`.
- `subprocessor-inventory.json` , obrigatório para `subprocessors` (inventário anterior = base para a comparação).

Campo obrigatório faltando → faça UMA pergunta pontual com dica de modalidade (conectar Google Drive / colar URL da landing page / conectar Firecrawl), grave, continue.

## Passos

1. **Leia o registro e o contexto jurídico.** Reúna os campos obrigatórios que faltam. Grave de forma atômica.
2. **Descubra ferramentas via Composio.** Execute `composio search web-scrape` (privacy-posture, subprocessors) ou `composio search document-storage` (template-library) conforme o escopo. Nenhuma ferramenta conectada → nomeie a categoria para conectar, pare.
3. **Ramifique pelo `scope`.**
   - `privacy-posture`:
     1. Execute a raspagem web contra a URL da landing page e as rotas principais do produto. Capture tags de analytics, cookies aplicados, formulários e campos, incorporações de terceiros, scripts que revelam subprocessadores (Stripe, Intercom, Segment, HotJar, etc.).
     2. Busque a Política de Privacidade publicada (via URL do registro ou a mesma raspagem).
     3. Compare: ferramentas observadas no site que não estão na política, categorias de dados coletadas não divulgadas, novas categorias de cookies, mudança de finalidade (a descrição do produto mudou de forma relevante desde a última atualização da política).
     4. Marque a gravidade de cada descoberta (`critical` , exposição regulatória; `high` , risco de confiança do cliente; `medium` , organização geral; `low` , apenas para conhecimento). Cite a autoridade em toda descoberta `critical` (GDPR Art. 13/14, CCPA §1798.100, 16 CFR Parte 314 quando aplicável).
     5. Grave `privacy-audits/{YYYY-MM-DD}.md`: Resumo executivo → Diferenças por gravidade → Próximo passo recomendado por descoberta (na maioria das vezes: encadear com `draft-a-legal-document` type=privacy-policy).
   - `subprocessors`:
     1. Leia o atual `subprocessor-inventory.json`.
     2. Percorra as integrações conectadas (via conexões Composio instaladas pelo usuário), toda ferramenta conectada que toca dados de clientes é uma candidata a subprocessador.
     3. Raspe a landing page em busca de pistas extras (Stripe, Intercom, Calendly, etc. via scripts públicos).
     4. Para cada candidato capture: `role` (pagamento / e-mail / analytics / suporte / hospedagem / IA / CRM / outro), `dataCategories` (identificadores / uso / conteúdo / pagamento / sensível), `transferMechanism` (SCCs / UK IDTA / DPF / intra-UE / somente intra-EUA / desconhecido), `dpaStatus` (padrão assinado / negociado assinado / publicado / ausente / desconhecido), `publicDpaUrl`.
     5. Leia, combine e grave `subprocessor-inventory.json`. Diferença em relação ao anterior = adicionado / removido / alterado / inalterado.
     6. Grave `subprocessor-reviews/{YYYY-MM-DD}.md` , uma página de mudanças, "novos fornecedores que precisam de atualização de política" no topo + link para `audit-compliance` scope=privacy-posture como próximo passo.
   - `template-library`:
     1. Leia `domains.contracts.templateLibrary`. Para cada modelo, verifique `lastUpdatedAt` (ou os metadados do arquivo); sinalize qualquer coisa com mais de 12 meses.
     2. Para cada modelo desatualizado, liste as mudanças legais atuais a considerar (divulgação de treinamento de IA para consultoria / MSA / documentos de cliente; verificação de versão da SCC 2021 / 2025 para DPAs; padrões de DPA de 2026; linguagem de período de correção do CCPA; divulgações do AI Act da UE para funcionalidades que envolvem IA).
     3. Classifique por exposição (documentos de cliente > documentos de fornecedor > interno).
     4. Grave `template-reviews/{YYYY-MM-DD}.md` , plano de atualização: (a) modelos para atualizar agora, (b) revisar no próximo trimestre, (c) ainda atuais. Nunca reescreve automaticamente; recomenda encadear `draft-a-legal-document` para cada modelo.
4. **Adicione ao `outputs.json`** , leia, combine e grave de forma atômica: `{ id, type: "privacy-audit" | "subprocessor-review" | "template-review", title, summary, path, status: "ready", domain: "compliance", createdAt, updatedAt, attorneyReviewRequired? }`. Defina `attorneyReviewRequired: true` quando uma descoberta `critical` implicar exposição regulatória.
5. **Resuma para o usuário.** Um parágrafo curto em linguagem simples: as 2 principais descobertas e o próximo passo mais útil (por exemplo, "Quer que eu redija uma política de privacidade atualizada que feche essas lacunas?"). Nunca cite arquivos, caminhos, ou procedimentos internos.

## O que eu nunca faço

- Corrigir qualquer coisa automaticamente. A skill mostra as diferenças e recomenda próximos passos; o fundador decide.
- Inventar um subprocessador, fluxo de dados, ou cookie não observado na raspagem ou na integração conectada. Dado faltando → DESCONHECIDO.
- Afirmar que a política é compatível com a GDPR. Posso dizer "a política divulga X, não divulga Y", nunca "você está coberto."
- Fixar nomes de ferramentas no código, descoberta via Composio apenas em tempo real.
- Sobrescrever `subprocessor-inventory.json` , sempre ler, combinar e gravar.
- Pular a citação de autoridade em qualquer descoberta `critical` de privacy-posture.

## Saídas

- `privacy-audits/{YYYY-MM-DD}.md` (scope=privacy-posture).
- `subprocessor-reviews/{YYYY-MM-DD}.md` + atualiza `subprocessor-inventory.json` (scope=subprocessors).
- `template-reviews/{YYYY-MM-DD}.md` (scope=template-library).
- Adiciona ao `outputs.json`.
