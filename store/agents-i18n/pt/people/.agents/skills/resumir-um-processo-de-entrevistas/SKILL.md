---
name: resumir-um-processo-de-entrevistas
title: "Resumir um processo de entrevistas"
description: "Reúno os comentários do painel depois de um processo de entrevistas e organizo tudo em temas, contradições, notas da rubrica e um memorando de contratar ou não contratar. Você decide, eu só te dou a leitura mais clara do que o painel realmente disse."
version: 1
category: Pessoas
featured: no
image: busts-in-silhouette
integrations: [notion, linear, slack, loops]
---


# Resumir um processo de entrevistas

## Quando usar

- Explícito: "resuma o feedback do painel sobre {candidate}", "contratar ou não contratar {candidate}", "resuma o processo", "memorando de decisão para {candidate}".
- Pré-requisito: existirem ≥2 blocos de feedback de entrevistadores (anexados ao arquivo do processo, colados pelo usuário, ou buscados via chat conectado / ferramenta de colaboração).
- Uma chamada por processo de entrevistas de candidato. Anexo, nunca substituo, os resumos anteriores.

## Conexões de que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma → eu nomeio a categoria, peço para você conectá-la na aba Integrações, e paro.

- **Chat (Slack, Discord)** - buscar o feedback do painel em conversas, se a sua equipe escreve ali. Opcional.
- **Documentos (Notion)** - ler fichas de avaliação ou páginas de feedback. Opcional.
- **Gestão de projetos (Linear)** - buscar feedback se ele é registrado como tickets. Opcional.
- **Caixa de entrada (Loops ou Gmail)** - ler e-mails de feedback dos entrevistadores. Opcional.

Se nada disso estiver conectado e o arquivo do processo não tiver blocos de feedback, peço para você colar o feedback antes de eu resumir.

## Informações de que preciso

Leio primeiro o seu contexto de pessoas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Registro do processo do candidato** - Obrigatório. Por que preciso: eu resumo com base no resumo de preparação e na estrutura do painel. Se faltar, pergunto: "Não tenho um processo registrado para esse candidato. O processo foi agendado aqui, ou em outro lugar?"
- **Feedback dos entrevistadores** - Obrigatório. Por que preciso: resumir sem feedback é invenção. Se faltar, pergunto: "Onde está o feedback do painel? Posso buscar no Slack, Notion ou Linear, ou você pode colar aqui."
- **Rubrica da vaga** - Obrigatório. Por que preciso: avalio o processo em relação aos seus requisitos essenciais. Se faltar, pergunto: "Para qual vaga e nível é esse candidato, e quais são os três requisitos essenciais?"
- **Framework de níveis** - Obrigatório. Por que preciso: as faixas de contratar / não contratar mapeiam para o seu padrão nesse nível. Se faltar, pergunto: "Como você descreveria o que é 'atingir o padrão' nesse nível?"

## Passos

1. **Ler o documento de contexto de pessoas** em `context/people-context.md`. Se estiver ausente/vazio, digo ao usuário: "Primeiro preciso do seu contexto de pessoas, rode a habilidade configurar-minhas-informacoes-de-pessoas." Paro. Busco o framework de níveis para o nível alvo, os valores, os limites inegociáveis, as regras de escalonamento.
2. **Leio a vaga.** Abro `reqs/{role-slug}.md` para a rubrica de critérios.
3. **Leio o arquivo do processo.** Abro `interview-loops/{candidate-slug}.md`. Se estiver ausente, digo ao usuário que não existe arquivo de processo, paro.
4. **Reúno o feedback dos entrevistadores.** Procuro seções `## Feedback - {interviewer}` no arquivo do processo. Se o usuário disse que o feedback está em outro lugar, rodo `composio search chat` ou `composio search collab` para achar o slug da ferramenta e buscar as conversas / páginas indicadas. Se for colado, aceito o texto colado e sigo em frente. Se não houver nada disponível, faço UMA pergunta: "Onde está o feedback? Posso buscar no Slack / Notion / Linear, ou você pode colar."
5. **Extraio temas.** Agrupo o feedback em:
   - **Pontos fortes** - afirmações com que vários integrantes do painel concordam.
   - **Preocupações** - afirmações com que vários integrantes do painel concordam.
   - **Contradições** - onde os integrantes do painel discordaram; destaco a divergência, proponho uma solução (ligação de referência, entrevista extra, ou pular essa etapa).
   - **NÃO SE SABE** - critérios da rubrica que ninguém cobriu.
6. **Avalio conforme a rubrica.** Por critério, agrego as notas do painel onde houver; preencho as lacunas com "não avaliado" onde NÃO SE SABE. Faixa geral: **contratar / limítrofe / não contratar**.
7. **Produzo o memorando de decisão.**
   - Recomendação: contratar / não contratar.
   - Confiança: baixa / média / alta, e por quê.
   - Justificativa: 3 a 5 frases ligando temas + notas da rubrica.
   - Riscos se contratar: 2 a 3 itens.
   - Riscos se recusar: 2 a 3 itens (por exemplo, pipeline reabre, questão de tempo).
   - Temas de referência para verificar - 3 a 5 perguntas para as referências.
   - **Rodapé explícito "Só recomendação, o fundador decide".**
8. **Verifico as regras de escalonamento.** Se o feedback toca em temas de classes protegidas, preocupações de anti-discriminação, ou assuntos juridicamente sensíveis, PARO o memorando, sinalizo uma nota de escalonamento apontando para o advogado humano conforme a seção de regras de escalonamento em context/people-context.md. Sem recomendação nesses pontos.
9. **Escrevo o memorando.** Anexo uma seção datada `## Resumo - {YYYY-MM-DD}` a `interview-loops/{candidate-slug}.md`. Escrita atômica (`*.tmp` → renomear). Nunca substituo seções anteriores.
10. **Anexo em `outputs.json`** → `{ id, type: "debrief", title, summary, path: "interview-loops/{candidate-slug}.md", status: "draft", createdAt, updatedAt }`, escrevo de forma atômica.
11. **Resumo para o usuário** → um parágrafo: recomendação, confiança, principal motivo, principal risco, caminho do memorando.

## Nunca invento

- Nunca invento feedback de entrevistador. Integrante do painel não opinou = NÃO SE SABE.
- Nunca reduzo contradições a um falso consenso, eu as destaco.
- Nunca tomo a decisão final de contratar/desligar; sempre "só recomendação".
- Nunca escrevo sob `.houston/<agent>/`.

## Resultados

- `interview-loops/{candidate-slug}.md` (memorando de decisão anexado).
- Anexos em `outputs.json` com tipo `debrief`.
