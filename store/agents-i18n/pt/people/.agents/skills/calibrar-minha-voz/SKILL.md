---
name: calibrar-minha-voz
title: "Calibrar minha voz"
description: "Analiso suas comunicações anteriores de RH (ofertas, check-ins, conversas difíceis) para conseguir imitar seu tom em cada rascunho. Conecte o Gmail ou o Outlook para obter a leitura mais precisa da sua voz, ou cole de três a cinco exemplos."
version: 1
category: Pessoas
featured: no
image: busts-in-silhouette
integrations: [gmail, outlook]
---


# Calibrar minha voz

Ofertas, recusas, comunicados para a equipe, planos de melhoria de desempenho (PIPs), conversas de retenção, toda habilidade que este agente redige segue a sua voz. A habilidade analisa como você realmente escreve as comunicações de RH e registra uma impressão digital de tom em `context/people-context.md`, que todo rascunho seguinte consulta.

## Quando usar

- "calibre minha voz de RH" / "analise minhas ofertas anteriores" / "aprenda como eu escrevo comunicações de RH".
- "atualize as notas de voz no documento de contexto de pessoas".
- Chamado implicitamente por `set-up-my-people-info` quando a seção de notas de voz está rasa ou desatualizada.

## Conexões de que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma → eu nomeio a categoria, peço para você conectá-la na aba Integrações, e paro.

- **Caixa de entrada (Gmail, Outlook)** - analisar suas mensagens enviadas relacionadas a RH. Obrigatório quando você quer que eu extraia exemplos.

Se nenhuma caixa de entrada estiver conectada, pergunto uma vez se quer que eu analise uma caixa conectada ou se prefere colar de três a cinco exemplos.

## Informações de que preciso

Leio primeiro o seu contexto de pessoas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Exemplos de voz** - Obrigatório. Por que preciso: cada item da impressão digital precisa vir de exemplos reais. Se faltar, pergunto: "Conecte sua caixa de entrada para eu buscar de 10 a 20 mensagens recentes de RH, ou cole de três a cinco exemplos aqui."
- **Escopo dos exemplos** - Opcional. Por que preciso: permite filtrar por comunicações com candidatos ou com a equipe. Se você não tiver essa informação, eu sigo com o conjunto mais amplo relacionado a RH que eu encontrar.
- **Exemplos de notícias difíceis** - Opcional. Por que preciso: recusas e introduções de PIP soam diferente de mensagens comemorativas. Se você não tiver essa informação, eu sigo com A DEFINIR na impressão digital de notícias difíceis.

## Passos

1. **Ler o documento de contexto de pessoas** (arquivo próprio): `context/people-context.md`. Leio a seção de notas de voz existente para que a execução seja um complemento/mesclagem, não uma substituição. Se o documento não existir, rodo `set-up-my-people-info` primeiro.

2. **Escolho a fonte, faço UMA pergunta objetiva se não estiver óbvio, com dica de modalidade:**
   - "Posso buscar de 10 a 20 mensagens recentes de RH enviadas na caixa de entrada conectada, ou você pode colar de 3 a 5 exemplos. O que prefere?"
   - Conectado: rodo `composio search inbox`; identifico mensagens enviadas marcadas com destinatários relevantes de RH (candidatos, equipe); busco.
   - Colado: uso o texto colado como está.

3. **Se conectado, busco.** Executo o slug de listar-mensagens-enviadas da ferramenta de caixa de entrada descoberta. Filtro para mensagens relacionadas a RH, candidatos, funcionários, comunicados para toda a equipe. Se a caixa de entrada não conseguir diferenciar, peço o nome do marcador/pasta ou o período de datas. Registro: data de envio, papel do destinatário (inferido), assunto, corpo.

4. **Extraio a impressão digital de tom.** Por exemplo, anoto:
   - **Padrão de saudação** - "Oi {name}," vs "Olá {name}," vs "{name},"
   - **Padrão de despedida** - "Até logo,", "{firstname}", "Abraços,".
   - **Comprimento das frases** - média + variação.
   - **Nível de formalidade** - 1 (casual) a 5 (formal).
   - **Frases proibidas** - o que o fundador nunca diz (por exemplo, nunca "retomar contato", nunca "sinergia", nunca "bater um papo").
   - **Peculiaridades** - travessões vs vírgulas, parágrafos de uma linha vs densos, uso de emoji, variações de assinatura, como entrega notícias difíceis.
   - **Registro de notícias difíceis** - como a pessoa escreve recusas, avisos de desligamento, introduções de PIP. Diferente de mensagens comemorativas; registro separadamente.

5. **Sintetizo o conjunto todo.** Reúno em 4 a 6 itens:
   - Hábitos de saudação.
   - Preferência de comprimento/ritmo das frases.
   - Nível de formalidade.
   - Frases proibidas.
   - Registro de notícias difíceis.
   - Alguma peculiaridade marcante.

   Além de 3 a 5 trechos literais (curtos, 2 a 3 frases cada) exemplificando a voz.

6. **Anexo à seção de notas de voz de `context/people-context.md`.** NÃO substituo a seção, mesclo. Preservo qualquer coisa que o fundador já tenha refinado. Escrevo de forma atômica em `context/people-context.md.tmp` e depois renomeio.

7. **Também atualizo `config/voice.md`**, com a mesma impressão digital e os mesmos trechos literais, para que habilidades futuras leiam localmente sem reprocessar o documento compartilhado. Escrita atômica.

8. **Anexo em `outputs.json`.** Leio-mesclo-escrevo de forma atômica, uma entrada de resumo apontando para a atualização, não um arquivo independente:

   ```json
   {
     "id": "<uuid v4>",
     "type": "voice-calibration",
     "title": "Voz calibrada - <YYYY-MM-DD>",
     "summary": "<2-3 frases - N exemplos analisados, top 3 notas da impressão digital, o que mudou em context/people-context.md>",
     "path": "context/people-context.md",
     "status": "ready",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

   (A entrada aponta para o documento vivo, já que não há artefato independente, as notas de voz vivem dentro de `context/people-context.md`.)

9. **Nunca invento.** Toda peculiaridade/item da impressão digital precisa vir de exemplos reais. Se o conjunto de exemplos for fino demais (menos de 5 mensagens), digo isso e paro, uma impressão digital instável é pior do que nenhuma.

10. **Resumo para o usuário.** Um parágrafo: N exemplos analisados, top 3 itens da impressão digital, onde ficou registrado no documento de contexto de pessoas, o que outras habilidades agora redigem melhor.

## Resultados

- Atualiza a seção de notas de voz de `context/people-context.md` (documento vivo).
- Atualiza `config/voice.md` com a nova impressão digital + trechos.
- Anexos em `outputs.json` com `type: "voice-calibration"`.
