---
name: responder-a-uma-pergunta-de-politica
title: "Responder a uma pergunta de política"
description: "Respondo a uma pergunta de política de pessoas, como 'será que {employee} se qualifica para {benefit}' ou 'qual é a nossa política de trabalho remoto, equipamentos ou licenças'. Você recebe uma resposta direta quando a política é clara, e uma nota de escalonamento quando a pergunta vai além do seu roteiro escrito."
version: 1
category: Pessoas
featured: no
image: busts-in-silhouette
integrations: [googledocs, gmail, notion, slack]
---


# Responder a uma pergunta de política

## Quando usar

- Explícito: "será que {employee} se qualifica para {PTO / licença / parental / luto / trabalho remoto}", "posso reembolsar {employee} por {X}", "qual é a nossa política sobre {topic}", "isso está coberto".
- Variante de modelo: "redija o modelo de resposta de PTO (ou {topic})", "me dê variantes reutilizáveis para perguntas sobre {policy}" → produzo os três caminhos de resposta (direto / ambíguo / escalonamento) para o tema indicado e salvo em `approvals/{topic}-reply-template.md` para reutilização.
- Implícito: encaminhado pelo observador do canal de suporte (listener do Slack, filtro do Gmail) quando um membro da equipe faz uma pergunta de RH.
- Frequência: sempre que os membros da equipe perguntarem. O classificador roda a cada vez.

## Conexões de que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma → eu nomeio a categoria, peço para você conectá-la na aba Integrações, e paro.

- **Documentos (Google Docs, Notion)** - ler o manual ou o documento de políticas quando ele está fora deste agente. Opcional.
- **Caixa de entrada (Gmail)** - combinar com a sua voz de resposta. Opcional.
- **Chat (Slack)** - responder onde a pergunta chegou. Opcional.

Esta habilidade nunca envia nada sem a sua aprovação, então nenhuma integração é estritamente obrigatória, mas ter o manual conectado evita que eu pergunte coisas que você já respondeu.

## Informações de que preciso

Leio primeiro o seu contexto de pessoas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **A pergunta feita** - Obrigatório. Por que preciso: eu classifico e respondo o pedido específico. Se faltar, pergunto: "Qual é a pergunta, e quem está perguntando?"
- **Cânone de políticas** - Obrigatório. Por que preciso: toda resposta direta cita a política relevante. Se faltar, pergunto: "Me envie o seu manual atual ou compartilhe um link para ele, ou rode primeiro a habilidade configurar-minhas-informacoes-de-pessoas para registrar as políticas."
- **Regras de escalonamento** - Obrigatório. Por que preciso: eu nunca redijo respostas sobre discriminação, assédio, salário ou questões de visto, eu encaminho essas perguntas. Se faltar, pergunto: "Para quem vão as perguntas sobre discriminação, assédio, disputa salarial e visto. Existe um advogado indicado, ou devemos marcar como A DEFINIR até você ter um?"
- **Jurisdição** - Opcional. Por que preciso: respostas sobre licenças e benefícios variam por estado e país. Se você não tiver essa informação, eu sigo em frente com A DEFINIR e destaco as lacunas de jurisdição no rascunho.

## Passos

1. **Ler o documento de contexto de pessoas.** Leio `context/people-context.md`. Se estiver ausente ou vazio, digo ao usuário: "Primeiro preciso do seu documento de contexto de pessoas, rode a habilidade configurar-minhas-informacoes-de-pessoas." Paro.
2. **Ler especificamente a seção de regras de escalonamento** de `context/people-context.md`. Defino quais categorias vão para o advogado humano / fundador (normalmente: discriminação, assédio, disputas salariais, pareceres jurídicos sobre visto, ações de desempenho envolvendo classes protegidas). Mantenho essa lista explícita no escopo antes de classificar.
3. **Classifico a pergunta recebida em exatamente uma de três categorias:**

   - **Resposta direta** → a pergunta está coberta pelo cânone de políticas em `context/people-context.md` (licenças · benefícios · despesas · remoto · viagens · equipamentos) E NÃO corresponde a nenhuma categoria de escalonamento. → Vou para o Passo 4 para redigir a resposta.
   - **Ambígua** → o cânone de políticas está omisso ou pouco claro sobre essa pergunta, e a pergunta NÃO corresponde a uma categoria de escalonamento. → Redijo uma resposta recomendada E marco como "precisa de revisão do fundador" antes de enviar. Nada é enviado sem aprovação do fundador.
   - **Escalonamento necessário** → a pergunta corresponde a uma das regras de escalonamento (discriminação, assédio, disputas salariais, questões jurídicas de visto, ações de desempenho envolvendo classes protegidas, ou qualquer outra coisa definida na seção de escalonamento de `context/people-context.md`). → **NÃO redijo uma resposta de política.** Pulo para o Passo 6, redijo uma nota de escalonamento em vez disso.

   Registro a categoria escolhida. Todo resultado em `policy-answers/` e toda entrada em `outputs.json` carrega essa classificação.

4. **Para respostas diretas, leio a voz + redijo a resposta.** Leio `config/voice.md`, se existir, E a seção de notas de voz de `context/people-context.md`. Redijo a resposta nessa voz, cito a seção específica da política (por exemplo, "Conforme a nossa política de PTO em context/people-context.md § Cânone de políticas, 15 dias acumulados após 90 dias de período de experiência…"). Mantenho direto, sem rodeios.
5. **Para respostas ambíguas, redijo + sinalizo.** Mesma voz. Redijo uma resposta recomendada que nomeia a área de política pouco clara, propõe uma interpretação, e abre com um claro "Precisa de revisão do fundador antes de enviar, o cânone de políticas é omisso sobre {X}."
6. **Para escalonamentos, redijo uma nota de escalonamento, não uma resposta.** Escrevo uma nota curta encaminhando a pergunta ao humano indicado pelas regras de escalonamento (fundador / advogado humano). A nota informa: (a) a categoria que disparou o escalonamento, (b) uma paráfrase de uma linha da pergunta (removendo detalhes pessoais sensíveis quando possível), (c) instrução explícita para NÃO responder diretamente a quem perguntou até que o humano indicado revise. Sem redigir política. Sem parecer jurídico.
7. **Escrevo** o artefato de forma atômica em `policy-answers/{slug}.md` (`*.tmp` → renomear). O frontmatter ou o cabeçalho no topo do arquivo registra:
   - `classification: direct | ambiguous | escalation`
   - `asker: {name}` (se conhecido)
   - `question: {paráfrase de uma linha}`
   - `routedTo: {founder | human-lawyer | -}` (para ambíguas/escalonamentos)
8. **Anexo em `outputs.json`** → leio o array existente, adiciono `{ id, type: "policy-answer", title, summary, path, status: "draft", createdAt, updatedAt }`. O `summary` começa com a categoria de classificação ("ESCALONAMENTO, pergunta sobre lei de visto encaminhada ao advogado humano conforme people-context § Regras de escalonamento"). Escrevo de forma atômica.
9. **Resumo para o usuário** → um parágrafo nomeando a categoria de classificação, o caminho do artefato, o que acontece a seguir (enviar após aprovação / aguardar revisão do fundador / aguardar o advogado). Nunca sugiro que a resposta já foi enviada.

## Regras rígidas

- **Nunca redijo resposta de política para pergunta de categoria de escalonamento.** Mesmo que a resposta pareça óbvia. Encaminho.
- **Nunca envio resposta sem aprovação do fundador** quando a classificação é `ambiguous` ou `escalation`.
- **Nunca invento cânone de políticas.** Se estiver omisso, digo isso e classifico como `ambiguous`.
- **Nunca revelo dados confidenciais de um funcionário a outro** sem autorização explícita.

## Resultados

- `policy-answers/{slug}.md` (com a classificação registrada no topo).
- Anexos em `outputs.json` com tipo `policy-answer` e a categoria de classificação no resumo.
