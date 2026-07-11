---
name: coletar-as-atualizacoes-da-minha-equipe
title: "Coletar as atualizações da minha equipe"
description: "Execute o ciclo semanal de atualizações sem precisar cobrar sua equipe pessoalmente. Eu envio a mensagem pelo Slack ou e-mail na sua voz, coleto o que vem de volta, e analiso cada atualização em relação às suas prioridades ativas para que você veja o que está no caminho certo, o que está se desviando, quem está bloqueado e quem não respondeu. Fica inativo com uma mensagem amigável se você ainda não tiver uma seção de equipe nas suas informações operacionais."
version: 1
category: Operações
featured: no
image: clipboard
integrations: [gmail, slack]
---


# Coletar As Atualizações Da Minha Equipe

Ciclo semanal de atualizações voltado para a equipe. Habilidade fica inativa para um fundador realmente solo, no momento em que o fundador contrata 1 ou mais pessoas e as lista no contexto operacional, ela se ativa.

## Quando usar

- "colete as atualizações desta semana da equipe".
- "estamos no caminho certo com as metas essa semana".
- "envie o lembrete de sexta e analise o que voltar".

## Conexões que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Chat da equipe** (Slack, Microsoft Teams) - Obrigatório. O melhor lugar para enviar o lembrete semanal e ler as respostas.
- **Caixa de entrada** (Gmail, Outlook) - Opcional. Alternativa quando os membros da equipe vivem mais no e-mail do que no chat.

Se nem o chat da equipe nem a caixa de entrada estiverem conectados, paro e peço para você conectar o chat da equipe primeiro.

## Informações que preciso

Leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Lista da equipe** - Obrigatório. Por que preciso: esta habilidade só age sobre a sua equipe declarada, nunca sobre contatos aleatórios. Se faltar, pergunto: "Quem está na sua equipe agora? Nomes mais como devo contatar cada pessoa, o ideal é enviar uma planilha da equipe ou listá-los no seu contexto operacional."
- **Prioridades ativas** - Obrigatório. Por que preciso: julgo cada atualização em relação ao que a empresa está realmente tentando fazer neste trimestre. Se faltar, pergunto: "Quais são as 2 a 3 coisas que a empresa está priorizando neste trimestre?"
- **Dia de revisão** - Opcional. Por que preciso: define o prazo para as respostas. Se você não tiver isso, sigo em frente com TBD e uso uma janela de 48 horas.
- **Sua voz** - Opcional. Por que preciso: o lembrete soa como você, não como um robô. Se você não tiver isso, sigo em frente com TBD usando um tom neutro, o ideal é conectar sua caixa de entrada para eu analisar de 20 a 30 mensagens enviadas.

## Passos

1. **Leio `context/operations-context.md`.** Se a seção "Contatos-chave / Equipe" estiver ausente, vazia, ou N≤1 (só o fundador), paro e digo:

   > "Esta habilidade coleta atualizações semanais de uma equipe. Seu contexto operacional ainda não lista ninguém, então não há de quem coletar. Rode `set-up-my-ops-info` e adicione uma seção de Equipe quando você contratar, aí esta habilidade se ativa."

   NÃO ajo sobre contatos externos que não estão na lista da equipe.

2. **Leio `config/update-template.md` se existir.** Senão uso o modelo padrão abaixo.

3. **Envio os lembretes.** Para cada membro da equipe na seção Equipe:
   - `composio search chat` (preferido) ou `composio search inbox`, executo a ferramenta de envio de mensagem para o provedor de chat da equipe do fundador.
   - Entrego o modelo de mensagem como DM ou resposta em conversa, endereçado a essa pessoa. Uso a voz do fundador conforme `config/voice.md`.
   - Modelo padrão:

     > "Oi {nome}, hora da atualização semanal. Três perguntas, 2 minutos:
     > (1) O que foi entregue essa semana? (2) O que está bloqueado, e o que
     > você precisa de mim para destravar? (3) Qual é a maior aposta da
     > próxima semana? Responda aqui quando tiver 2 minutos, prazo até o fim do dia
     > {reviewDay}."

   **Exceção aos limites inegociáveis do workspace:** esta habilidade envia lembretes internos para a equipe. NÃO são comunicações externas. Envios externos continuam proibidos.

4. **Espero as respostas.** O usuário define a janela (padrão: até o fim do dia de `rhythm.json.reviewDay`, ou 48h a partir do envio se o ritmo não estiver configurado). Se o usuário invocar a habilidade uma segunda vez na mesma semana, consumo a janela já decorrida.

5. **Coleto as respostas.** Puxo as respostas da mesma ferramenta de chat / caixa de entrada, casadas por conversa.

6. **Analiso o alinhamento** com as prioridades ativas de `context/operations-context.md`:

   - **No caminho certo** - itens entregues que se conectam a uma prioridade ativa.
   - **Se desviando** - trabalho acontecendo que não se conecta.
   - **Bloqueado** - bloqueios declarados, com quem se espera que destrave.
   - **Silencioso** - membros da equipe que não responderam.

7. **Escrevo** o resumo em `updates/{YYYY-MM-DD}-roundup.md` com as quatro seções + uma lista "O que o fundador deveria fazer" no final (de 1 a 3 itens: destravar {pessoa} em {coisa}, redefinir o escopo de {projeto}, reconhecer {conquista}).

8. **Escritas atômicas** - `*.tmp` → renomear.

9. **Adiciono a `outputs.json`** com `type: "updates"`, status "ready".

10. **Resumo para o usuário** - contagens (N no caminho certo / M se desviando / P bloqueados / Q silenciosos) + a principal ação do fundador do resumo.

## Saídas

- `updates/{YYYY-MM-DD}-roundup.md`
- Adiciona a `outputs.json` com `type: "updates"`.

## O que eu nunca faço

- **Enviar lembretes para contatos externos.** A seção Equipe no contexto operacional é a lista permitida; todo o resto é externo.
- **Modificar registros de RH / folha de pagamento** com base nas atualizações coletadas, somente leitura nos sistemas de registro.
- **Rodar se a seção Equipe estiver ausente.** Paro com a mensagem "ainda sem equipe"; não monto a lista da equipe por conta própria a partir de outras fontes.
