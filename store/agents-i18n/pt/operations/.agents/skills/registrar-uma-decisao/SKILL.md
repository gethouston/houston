---
name: registrar-uma-decisao
title: "Registrar uma decisão"
description: "Registre uma decisão da forma correta para ter um histórico ao qual recorrer depois. Eu escrevo uma entrada estilo ADR com contexto, alternativas consideradas, prós e contras, a decisão em si, a justificativa e as consequências. Me diga o que você decidiu e eu guardo no seu registro de decisões."
version: 1
category: Operações
featured: no
image: clipboard
integrations: [linkedin]
---


# Registrar Uma Decisão

## Quando usar

- O usuário diz "decidimos", "registre a decisão sobre", "capture essa chamada", "faça um ADR disso".
- Notas de reunião coladas/conectadas contêm um padrão claro de decisão.
- O usuário pede para revisar o backlog de decisões em aberto, a habilidade também marca linhas `pending` como `decided` quando o usuário as declara.

## Conexões que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Gravador de reuniões** (Fireflies, Gong) - Opcional. Me permite puxar uma transcrição quando você diz "registre a chamada que acabamos de ter." Se não estiver conectado, trabalho a partir do que você colar.
- **Documentos / notas** (Notion, Google Docs) - Opcional. Se você tiver um registro de decisões ou documento RACI em outro lugar, eu o leio antes de redigir.

Esta habilidade funciona sem nenhuma conexão. Nunca bloqueio aqui, na pior das hipóteses você descreve a decisão e eu capturo.

## Informações que preciso

Leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **A decisão em si** - Obrigatório. Por que preciso: estou capturando uma decisão específica, não gerando uma. Se faltar, pergunto: "O que você decidiu, e o que estava na mesa antes de você escolher?"
- **Partes interessadas e quem decide** - Obrigatório. Por que preciso: define se a linha entra como pendente ou decidida. Se faltar, pergunto: "Quem decidiu isso, você, um cofundador, a equipe, e isso é final ou ainda está em aberto?"
- **Direitos de decisão / RACI** - Opcional. Por que preciso: me permite assumir o status correto por padrão sem perguntar toda vez. Se você não tiver isso, sigo em frente com TBD e pergunto uma vez: "Quem decide sobre coisas como preço, contratação, ou estratégia de produto? Uma frase já serve."
- **Prioridades ativas** - Obrigatório. Por que preciso: marco se a decisão é estrutural para o que você está priorizando. Se faltar, pergunto: "Quais são as 2 a 3 coisas que a empresa está priorizando neste trimestre?"

## Passos

1. **Leio `context/operations-context.md`.** Se faltar ou estiver vazio, paro e peço para o usuário rodar `set-up-my-ops-info` primeiro. As prioridades ativas ancoram se a decisão é estrutural.

2. **Resolvo o assunto.** A partir do chat, extraio o tema da decisão e proponho um slug em kebab-case (ex. `mudar-preco-para-por-assento`). Confirmo brevemente se for ambíguo.

3. **Leio `config/decision-framework.md`.** Se estiver ausente ou escasso, faço UMA pergunta: *"Quem decide sobre preço / estratégia de produto / contratação / apostas estruturais? O ideal: envie um documento RACI ou uma página de direitos de decisão de um wiki conectado. Senão cole uma frase, eu vou expandindo conforme mais decisões chegarem."* Escrevo e continuo.

4. **Decido o `status`.** Com base na estrutura:
   - CEO decide e ainda não decidiu → `pending`.
   - Escopo de um responsável e o responsável declarou → `decided` com `decidedBy` e `decidedAt`.
   - Usuário é o CEO e declarou → `decided`.

5. **Verifico duplicatas.** Varro `decisions.json` em busca de slug existente ou título quase duplicado. Se existir, atualizo no lugar (adiciono alternativas a `considered`, refino `rationale`, mudo `pending` → `decided` com `decidedAt`) em vez de criar uma nova linha.

6. **Escrevo o ADR** em `decisions/{slug}/decision.md` (atômico):

   ```markdown
   # Decisão: {título}

   - **Status:** {pending | decided | superseded}
   - **Decidido por:** {quem, se decidido}
   - **Decidido em:** {ISO-8601, se decidido}
   - **Iniciativas vinculadas:** {slugs}

   ## Contexto
   {1-2 parágrafos, o que motivou isso, o que está em jogo}

   ## Alternativas consideradas
   1. **{Opção A}** - {descrição curta}. Prós e contras: {...}.
   2. **{Opção B}** - {descrição curta}. Prós e contras: {...}.
   3. **{Opção C / status quo se relevante}** - {...}.

   ## Decisão
   {o caminho escolhido, 1 parágrafo}

   ## Justificativa
   {por que esta opção em vez das alternativas, curto e honesto}

   ## Consequências
   - **Bom:** {o que fica mais fácil}
   - **Difícil:** {o que fica mais difícil}
   - **Incertezas:** {o que vamos aprender com o tempo}

   ## Perguntas em aberto
   {qualquer coisa ainda TBD}
   ```

7. **Faço upsert em `decisions.json`** com `{ slug, title, summary, status, decidedBy?, decidedAt?, linkedInitiativeSlugs, considered, rationale? }`. Mantenho `summary` em uma linha, isso aparece no painel.

8. **Assuntos sensíveis.** Se a decisão envolve desempenho, remuneração, saídas, ou questões jurídicas, NÃO deixo detalhes específicos no `summary` indexado. Generalizo ("Transição executiva em {área}" em vez de nomear), mantenho a narrativa completa só no arquivo markdown da decisão, sinalizo os detalhes só ao fundador no chat.

9. **Adiciono a `outputs.json`** com `type: "decision"`, status "ready" (a decisão é um artefato de registro).

10. **Resumo no chat.** Uma frase: o que foi registrado, o status, onde fica.

## Saídas

- `decisions/{slug}/decision.md` (novo ou sobrescrito)
- `decisions.json` atualizado (upsert)
- Possivelmente `config/decision-framework.md` atualizado (captura progressiva)
- Adiciona a `outputs.json` com `type: "decision"`.

## O que eu nunca faço

- **Decidir por você** - `log-a-decision` captura; o CEO decide.
- **Deixar detalhes sensíveis** em linhas indexadas compartilhadas.
- **Sobrescrever uma decisão substituída** silenciosamente - marco a antiga como `status: "superseded"` e vinculo a nova.
- **Inventar alternativas** - se o usuário só contou o caminho escolhido, faço uma pergunta para 1 a 2 alternativas realistas que estavam na mesa.
