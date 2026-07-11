---
name: organizar-minha-caixa-de-entrada-juridica
title: "Organizar minha caixa de entrada jurídica"
description: "Eu reviso a sua caixa de entrada em busca de assuntos jurídicos (contratos para revisar, NDAs, solicitações de dados de clientes, qualquer coisa que precise da atenção de um advogado) e te digo o que precisa de você e o que não precisa. Eu só organizo e resumo, nunca respondo."
version: 1
category: Caixa de entrada
featured: no
image: scroll
integrations: [gmail, outlook]
---


# Organizar minha caixa de entrada jurídica

## Quando usar

- Explícito: "triar minha caixa de entrada jurídica", "varrer o que chegou em busca de contratos", "que e-mail jurídico precisa de mim", "rodar a triagem".
- Implícito: primeira skill que o usuário roda quando vê um card de "Precisa de você" e pergunta "o que está esperando por mim?"
- Segura sob demanda, diária ou algumas vezes por semana para um fundador solo. Janela padrão: últimos 7 dias, se não especificado.

## Passos

1. **Leia o contexto compartilhado**: `context/legal-context.md`. Se estiver faltando ou vazio, pergunte ao usuário em linguagem simples: "Eu preciso de algumas informações básicas sobre a sua empresa primeiro. Quer configurar isso agora?" Depois rode `set-up-my-legal-info` se sim. Pare até que isso esteja feito.
2. **Leia a configuração**: `config/counterparty-stack.json`. Se a caixa de entrada não estiver conectada, pergunte ao usuário em linguagem simples: "Eu preciso conectar sua caixa de entrada para olhar o que chegou. Quer conectar o Gmail ou o Outlook agora?" Pare até que esteja conectada.
3. **Descubra a ferramenta de caixa de entrada via Composio.** Rode `composio search inbox` para achar o slug da ferramenta. Confirme que o slug corresponde a `counterparty-stack.inboxCategory`.
4. **Busque o que chegou.** Janela padrão: últimos 7 dias (ou N definido pelo usuário). Consulte o slug da caixa de entrada em busca de mensagens provavelmente jurídicas: anexos de contrato (.pdf, .docx), domínios de remetente de escritórios de advocacia, palavras-chave no assunto ("NDA", "MSA", "DPA", "DSR", "subpoena", "office action", "terms", "agreement"), threads que respondem a um jurídico anterior.
5. **Classifique cada item.** Aplique a rubrica, escolha um balde:
   - **NDA**: semáforo. **Verde** = mútuo, prazo de até 3 anos, escopo razoável, não solicitação padrão (ou nenhuma), sem residuais incomuns, sem não concorrência, lei dos EUA como aplicável. **Amarelo** = exatamente um desvio (unilateral, sendo nós o único divulgador; prazo de 3 a 5 anos; residuais amplos; jurisdição adjacente como Canadá/Reino Unido). **Vermelho** = dois ou mais desvios, ou qualquer um destes: não concorrência, cessão de propriedade intelectual, responsabilidade ilimitada, obrigações de publicidade / press release, prazo superior a 5 anos ou perpétuo, lei aplicável fora do padrão. Padrão Vermelho se o texto não puder ser analisado com confiança.
   - **MSA / formulário de pedido**: documento guarda-chuva ou de termos comerciais vindo de cliente/fornecedor.
   - **DPA**: aditivo de processamento de dados ou termos de dados independentes.
   - **DSR**: solicitação de titular de dados (GDPR Art. 15, CCPA).
   - **intimação / processo legal**: intimação, notificação de preservação, notificação extrajudicial, ordem de retenção de litígio.
   - **decisão do escritório de marcas**: decisão do USPTO ou correspondência de marca registrada.
   - **documento de contratado**: consultoria / contratado / trabalho por encomenda vindo da contraparte.
   - **outro**: qualquer outra coisa com viés jurídico (pedido de certificado de seguro, consulta de privacidade, questionário de segurança de fornecedor).
6. **Encaminhe cada item.** Recomende uma opção:
   - **resolver internamente via `draft-a-legal-document`**: apenas se o item se encaixar claramente em um modelo existente (por exemplo, uma NDA Verde com contraparte conhecida).
   - **enviar para `review-a-contract` (mode=full)**: a maioria dos MSA / DPA / formulário de pedido / NDAs Amarelas vai para cá.
   - **sinalizar `attorneyReviewRequired`**: NDAs Vermelhas, intimações, tudo próximo de litígio, qualquer coisa ambígua.
   - **ignorar**: spam, newsletters, threads resolvidas.
7. **Escreva** o resumo em `intake-summaries/{YYYY-MM-DD}.md` de forma atômica (`*.tmp` → renomear). Estrutura: contagens no topo ("7 itens: 3 NDA, 1 MSA, 1 DSR, 2 outros"), depois uma seção por item com `From`, `Subject`, `Received`, `Classification`, `One-line summary`, `Recommended route`.
8. **Adicione ao `outputs.json`**: leia o array existente, adicione `{ id, type: "intake-summary", title, summary, path, status: "draft", createdAt, updatedAt, attorneyReviewRequired }`. Defina `attorneyReviewRequired: true` se algum item for sinalizado para revisão de um advogado.
9. **Resuma para o usuário.** Linguagem simples. Um parágrafo curto: "Eu encontrei {N} itens jurídicos. {X} NDAs (com as seguras já sinalizadas), {Y} contratos de clientes, {Z} que precisam dos olhos de um advogado de verdade. Quer que eu redija as respostas para as seguras, ou revise por completo os contratos de clientes?" Nunca cite arquivos ou caminhos.

## Nunca invente

Toda classificação está ligada a uma mensagem observada. Se a ferramenta de caixa de entrada der erro ou não retornar dados, marque como UNKNOWN no resumo, não adivinhe. Se um anexo não puder ser interpretado, diga isso e peça ao usuário para colar o conteúdo.

## Resultados

- `intake-summaries/{YYYY-MM-DD}.md`
- Inclui uma entrada em `outputs.json` com o tipo `intake-summary`.
