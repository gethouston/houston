---
name: redigir-uma-mensagem
title: "Redigir uma mensagem"
description: "Receba uma mensagem redigida na sua voz e salva na sua caixa de entrada, para que você só precise clicar em enviar. Escolha o que você precisa: uma resposta a uma conversa recebida; um follow-up que registra um compromisso no seu registro ou redige o cumprimento dele quando vence; ou contato com fornecedores para renovações, cancelamentos, testes ou verificação de referências, baseado nos termos reais do seu contrato."
version: 1
category: Operações
featured: no
image: clipboard
integrations: [gmail, outlook]
---


# Redigir Uma Mensagem

Um primitivo de redação para todo envio externo. Sua voz, sua aprovação, seu botão de enviar, nunca envio, nunca assumo compromisso, nunca assino.

## Quando usar

- `type=reply` - "redija respostas" / "responda para {nome}" / "redija respostas para os e-mails recebidos na minha triagem".
- `type=followup` - "acompanhe este follow-up" (submodo TRACK) / "me lembre de dar retorno para {X}" (TRACK) / "cuide dos meus follow-ups vencidos" (HANDLE).
- `type=vendor` - "redija um e-mail de negociação de renovação" / "escreva um e-mail de cancelamento para {SaaS}" / "entre em contato com {fornecedor} para um teste" / "e-mail de verificação de referência para {fornecedor}".

## Conexões que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Caixa de entrada** (Gmail, Outlook) - Obrigatório. Puxa a conversa que estou respondendo, analisa sua voz, e salva o rascunho de volta na sua caixa de entrada para você revisar e enviar.
- **Arquivos** (Google Drive) - Opcional. Me permite ler contratos de fornecedores ao redigir e-mails de renovação ou cancelamento.

Se nenhuma caixa de entrada estiver conectada, paro e peço para você conectar sua caixa de entrada primeiro.

## Informações que preciso

Leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Sua voz** - Obrigatório. Por que preciso: as respostas soam como você em vez de um modelo genérico. Se faltar, pergunto: "O melhor jeito é conectar sua caixa de entrada para eu analisar de 20 a 30 mensagens enviadas. Senão, cole de 3 a 5 respostas recentes que você escreveu e eu trabalho a partir delas."
- **Documento de contexto operacional** - Obrigatório. Por que preciso: ancora prioridades e contatos-chave para que as respostas fiquem alinhadas. Se faltar, pergunto: "Quer que eu configure seu contexto operacional primeiro? As respostas ficam bem mais afiadas assim que eu tiver isso."
- **VIPs** - Opcional. Por que preciso: molda o tom e a deferência. Se você não tiver isso, sigo em frente com TBD e trato todos igualmente.
- **Postura com fornecedores** - Obrigatório para `type=vendor`. Por que preciso: guia os pedidos de renovação e a linguagem de recuo. Se faltar, pergunto: "Como você aborda conversas com fornecedores, pressiona forte por melhores termos, ou mantém leve? Quem tem autorização para assinar?"

## Parâmetro: `type`

- `reply` - responde uma conversa recebida. Puxo a conversa da caixa de entrada conectada, redijo a resposta na sua voz, salvo como rascunho no provedor da caixa de entrada, registro em formato legível. Saída: `drafts/reply-{YYYY-MM-DD}-{thread-slug}.md`.
- `followup` - dois submodos:
  - TRACK (padrão quando você diz "acompanhe isso" / "me lembre") - extraio o compromisso (quem, o quê, até quando), adiciono a `followups.json`, ainda sem rascunho.
  - HANDLE (quando você diz "cuide dos follow-ups vencidos" / "redija os atrasados") - leio `followups.json`, para cada follow-up com data de vencimento ≤ hoje, redijo o cumprimento ou um adiamento honesto ("Retomando o {X} que prometi até {Y}, status: {Z}"). Saída: `drafts/followup-{YYYY-MM-DD}-{slug}.md`.
- `vendor` - contato de renovação / cancelamento / teste / verificação de referência. Baseado nos termos do contrato em `contracts/` + na postura com fornecedores de `context/operations-context.md`. Saída: `drafts/vendor-{type}-{vendor-slug}.md`.

## Passos

1. Leio o registro; preencho `universal.voice` + qualquer lacuna em `domains.vendors.posture` com UMA pergunta classificada por modalidade.
2. Leio `context/operations-context.md` - prioridades, contatos-chave, limites inegociáveis, notas de voz.
3. Ramifico conforme `type`:

   **Se `type = reply`:**
   - Puxo a(s) conversa(s) alvo da caixa de entrada conectada (Gmail / Outlook via Composio). Se você nomeou alguém, resolvo para a conversa não respondida mais recente.
   - Leio o histórico da conversa + `context/operations-context.md` + `config/voice.md`.
   - Redijo a resposta: direta, com opinião quando cabível, com a voz correspondente. Sem hesitação ("acho que talvez"), sem saudações de preenchimento.
   - Salvo como RASCUNHO na caixa de entrada via Composio, uso o próprio recurso de rascunho do provedor da caixa de entrada, nunca envio. Também escrevo um registro legível em `drafts/reply-{YYYY-MM-DD}-{slug}.md` para revisão offline.

   **Se `type = followup` + submodo TRACK:**
   - Extraio o compromisso da entrada do usuário ou de um envio externo referenciado (quem deve o quê a quem, até quando).
   - Adiciono a `followups.json` com `{id, createdAt, updatedAt, with, commitment, dueAt, status: "pending", sourceArtifact}`.
   - Ainda sem rascunho, o acompanhamento é o entregável.

   **Se `type = followup` + submodo HANDLE:**
   - Leio `followups.json`. Para cada follow-up com `status == "pending"` e `dueAt <= hoje`:
     - Se o compromisso já foi cumprido em outro lugar (existe um envio em `drafts/` que trata disso), mudo para `status: "ready-to-close"`.
     - Senão, redijo o cumprimento ou um adiamento honesto. Uso a voz. Salvo em `drafts/followup-{YYYY-MM-DD}-{slug}.md` E como rascunho na caixa de entrada via Composio.

   **Se `type = vendor`:**
   - Leio o contrato do fornecedor se existir (`contracts/{vendor-slug}/`). Extraio: prazo, janela de renovação, preço, cláusulas desfavoráveis.
   - Leio a postura com fornecedores de `context/operations-context.md` (apetite ao risco, autoridade de assinatura, preferência de papelada).
   - Redijo o subtipo de envio solicitado:
     - Negociação de renovação: começo com dados (uso / valor), pedido específico (preço, prazo, termos), recuo.
     - Cancelamento: direto, grato, específico (cito a cláusula + data efetiva).
     - Teste: adequação de posicionamento + caso de uso específico + critérios de sucesso + prazo honesto.
     - Verificação de referência: de 3 a 5 perguntas direcionadas com base no que estamos avaliando.
   - Salvo como rascunho na caixa de entrada via Composio + escrevo o registro em `drafts/vendor-{sub-type}-{vendor-slug}.md`.

4. Toda ramificação: escrevo de forma atômica (`.tmp` → renomear).
5. Adiciono a `outputs.json` com `{id, type, title, summary, path, status: "draft", createdAt, updatedAt, domain: "people" ou "vendors"}`. Type = `"reply-draft"` / `"followup-log"` / `"followup-draft"` / `"vendor-draft"`.
6. Resumo para você: caminho do rascunho + o que verificar antes de aprovar.

## Saídas

- `drafts/reply-{YYYY-MM-DD}-{slug}.md`
- `followups.json` (upsert) e/ou `drafts/followup-{YYYY-MM-DD}-{slug}.md`
- `drafts/vendor-{sub-type}-{vendor-slug}.md`
- Adiciona a `outputs.json`; rascunhos na caixa de entrada via Composio para os tipos reply / followup-handle / vendor.

## O que eu nunca faço

- Enviar, agendar envio, ou arquivar automaticamente. Todo envio externo é um rascunho que você aprova + envia da sua própria caixa de entrada.
- Assumir compromisso em seu nome (nada de "te mando até sexta" a não ser que você tenha dito isso na conversa).
- Inventar estatísticas de uso do fornecedor ou termos de contrato, se o contrato não estiver em `contracts/` ou colado, marco como TBD e pergunto.
- Negociar preço sem um pedido explícito seu (ex. "peça 20% de desconto no anual").
