---
name: calibrar-minha-voz
title: "Calibrar minha voz"
description: "Eu puxo suas respostas recentes a clientes na sua caixa de entrada conectada, leio como você realmente escreve, e destilo isso em um perfil de voz que todo rascunho futuro vai seguir. Capto seu jeito de cumprimentar, o ritmo das frases, a despedida, as frases favoritas, e o jargão corporativo que você nunca usa. Depois que isso rodar, cada resposta, artigo e mensagem de ciclo de vida vai soar como se você mesmo tivesse escrito."
version: 1
category: Suporte
featured: no
image: headphone
integrations: [gmail, outlook]
---


# Calibrar Minha Voz

## Quando usar

- "calibre minha voz" / "treine com o meu jeito de escrever" / "puxe minhas respostas enviadas."
- Depois de `set-up-my-support-info`, quando a seção de voz está como `TBD`.
- Rode de novo quando o tom desviou ou quando você quer reaprender a partir de respostas recentes.

## Conexões de que preciso

Eu executo trabalho externo via Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Faltando alguma, eu nomeio a categoria, peço para você conectá-la na aba de Integrações, e paro.

- **Caixa de entrada** (Gmail / Outlook), para puxar de 10 a 20 das suas respostas enviadas recentes. Obrigatória.
- **Helpdesk de suporte** (Intercom / Help Scout / Zendesk), fonte alternativa se você responde a partir de um helpdesk em vez de e-mail. Obrigatória se o helpdesk é seu canal principal.

Se nenhuma das duas estiver conectada, eu paro e peço para você conectar a caixa de entrada ou o helpdesk de onde você realmente responde. Se preferir colar exemplos, eu mudo para esse caminho.

## Informações de que preciso

Eu leio seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e aguardo.

- **Fonte das amostras de voz**, obrigatória. Por que preciso: ou eu puxo de uma caixa de entrada conectada, ou você cola as amostras; eu não chuto. Se estiver faltando, pergunto: "Quer que eu puxe suas últimas 10 a 20 respostas a clientes de uma caixa de entrada conectada, ou prefere colar 3 a 5 exemplos aqui?"
- **Frases proibidas**, opcional. Por que preciso: frases que soam erradas vindo de você entram numa lista de nunca-usar. Se você não tiver, eu sigo com TBD e infiro a partir das amostras.

## Passos

1. **Ler `context/support-context.md`.** Se estiver faltando, rode `set-up-my-support-info` primeiro (ou pare e me avise).

2. **Descobrir a caixa de entrada conectada.** Rodar `composio search inbox` ou `composio search email-sent` (tente os dois, o slug exato depende do provedor conectado: Gmail, Outlook, Intercom, Help Scout, Zendesk, etc.). Nenhuma caixa conectada → dizer qual categoria conectar (conecte uma: Gmail, Outlook, Intercom, Help Scout, Zendesk) e parar.

3. **Puxar 10 a 20 respostas enviadas recentes.** Executar o slug da ferramenta list-sent / search-sent. Filtrar para respostas com cara de suporte (profundidade da conversa > 1, ou label/pasta contendo `support`, ou destinatário não interno). Mirar nas 10 a 20 mais recentes.

4. **Extrair pistas de tom das amostras:**
   - Padrão de cumprimento (ex.: "Oi Jane," vs "Oi," vs sem cumprimento).
   - Comprimento das frases: curtas / médias / longas.
   - Formalidade: casual / profissional / direta.
   - Convenção de assinatura / despedida.
   - Frases ou cacoetes recorrentes ("vou investigar," "para deixar claro," uso de travessão, etc.).
   - Frases que soam proibidas vindo da pessoa (ex.: "Peço desculpas pelo transtorno").

5. **Escrever `config/voice.md`** de forma atômica. Incluir:
   - Resumo do tom em um parágrafo (direto / caloroso / humano, traços específicos).
   - 3 a 5 trechos literais (os mais curtos e mais representativos) com dados pessoais redigidos via placeholders `{Customer}` / `{Email}`.
   - Lista em tópicos de "Frases proibidas".

6. **Atualizar `context/support-context.md`.** Ler o documento atual, encontrar a seção Tom + voz, substituir por um resumo de 2 frases apontando para `config/voice.md` para o detalhe completo. Escrever de forma atômica (`.tmp` → rename).

7. **Atualizar `universal.voice` em `config/context-ledger.json`**: `summary`, `sampleSource`, `sampleCount`, `capturedAt`.

8. **Acrescentar em `outputs.json`** com `type: "voice-calibration"`, `domain: "quality"`, título "Voz calibrada a partir de {N} amostras", resumo = 2 frases, path = `config/voice.md`, status `ready`.

9. **Resumir para mim.** Um parágrafo: como é o tom ("direto, caloroso, cheio de travessões; nunca pede desculpas pelo transtorno") e uma linha lembrando que todo rascunho de resposta, mensagem de ciclo de vida e artigo neste agente agora usa esse perfil.

## Saídas

- `config/voice.md` (amostras brutas + resumo do tom)
- `context/support-context.md` (resumo da seção de voz com ponteiro)
- `config/context-ledger.json` (bloco `universal.voice`)
- Acrescenta em `outputs.json` com `type: "voice-calibration"`, `domain: "quality"`.
