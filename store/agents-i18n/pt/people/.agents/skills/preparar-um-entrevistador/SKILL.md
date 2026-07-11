---
name: preparar-um-entrevistador
title: "Preparar um entrevistador"
description: "Receba um resumo de uma página para se preparar antes de entrar na entrevista, seja você ou alguém do painel: histórico do candidato, as perguntas que vale a pena fazer, os sinais de alerta da rubrica e a folha de pontuação. Dá para ler em dois minutos."
version: 1
category: Pessoas
featured: no
image: busts-in-silhouette
integrations: [notion, linkedin, loops]
---


# Preparar um Entrevistador

## Quando usar

- Explícito: "me prepare para entrevistar {candidato}", "o que devo perguntar para {candidato}", "resumo de entrevista para {candidato}", "me atualize para o loop de {candidato}".
- Implícito: chamado como dependência por `coordinate-an-interview-loop`, já que cada membro do painel precisa de um resumo personalizado.
- Uma chamada gera um resumo para um entrevistador. Precisa preparar o painel inteiro? Chame uma vez por entrevistador via `coordinate-an-interview-loop`.

## Conexões que preciso

Faço o trabalho externo pelo Composio. Antes de rodar esta habilidade, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu nomeio a categoria, peço para você conectá-la na aba Integrações e paro.

- **Documentos (Notion, Google Docs)** , ler rubricas de entrevistas anteriores ou compartilhar o resumo se você mantém isso em um workspace compartilhado. Opcional.
- **Coleta de dados na web (LinkedIn)** , atualizar informações de fundo a partir de um perfil público, se o registro do candidato estiver escasso. Opcional.
- **Caixa de entrada (Loops ou Gmail)** , buscar contexto de threads anteriores com o candidato para o resumo do entrevistador. Opcional.

Essa habilidade lê principalmente arquivos locais, então conexões faltando não me bloqueiam, eu apenas trabalho com o que já está no registro do candidato.

## Informações que preciso

Primeiro leio o seu contexto de pessoas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar texto) e espero.

- **Registro do candidato** , Obrigatório. Por que preciso: toda afirmação no resumo remete a ele. Se estiver faltando, pergunto: "Rode primeiro uma triagem desse candidato enviando o currículo ou compartilhando a URL do LinkedIn, para eu ter algo com base no qual montar o resumo."
- **Rubrica da vaga** , Obrigatório. Por que preciso: avalio as perguntas da entrevista contra os seus requisitos essenciais. Se estiver faltando, pergunto: "Para qual vaga é esse candidato, e quais são os seus três principais requisitos essenciais?"
- **Nome do entrevistador e foco** , Obrigatório. Por que preciso: cada membro do painel é dono de critérios diferentes da rubrica. Se estiver faltando, pergunto: "Quem vai conduzir essa entrevista, e qual é o foco dessa pessoa: técnico, sistemas, liderança ou valores?"
- **Framework de níveis** , Obrigatório. Por que preciso: a rubrica de pontuação está atrelada ao patamar esperado nesse nível. Se estiver faltando, pergunto: "Para qual nível estamos contratando, e como você descreveria o que é 'atingir o patamar' nesse nível?"

## Passos

1. **Leio o documento de contexto de pessoas** em `context/people-context.md`. Faltando ou vazio? Aviso o usuário: "Preciso primeiro do seu contexto de pessoas, rode a habilidade set-up-my-people-info." Paro. Extraio framework de níveis, valores, regras de escalonamento.
2. **Leio a vaga.** Abro `reqs/{role-slug}.md` para a rubrica de critérios. Faltando? Faço UMA pergunta direcionada, escrevo o arquivo.
3. **Leio o registro do candidato.** Abro `candidates/{candidate-slug}.md`. Faltando? Aviso o usuário: "Não há registro para {candidato}. Rode primeiro `screen-resume` ou `score-candidate` para eu ter algo com base no qual montar o resumo." Paro.
4. **Leio o arquivo do loop existente**, se presente em `interview-loops/{candidate-slug}.md`, para evitar duplicar perguntas já designadas a outros membros do painel.
5. **Pergunto pelo foco do entrevistador**, se não informado, com UMA pergunta: "Quem vai conduzir a entrevista e qual é a área de foco dessa pessoa (por exemplo, técnico, sistemas, liderança, valores)?" Isso delimita quais critérios da rubrica o entrevistador cobre.
6. **Monto o resumo.** Estrutura:
   - **Resumo do histórico do candidato** , 3 a 5 frases a partir do registro do candidato. Sem invenção; cito a fonte de cada afirmação (triagem / LinkedIn / sinal de sourcing).
   - **Áreas de foco deste entrevistador** , 2 a 3 critérios da rubrica sob responsabilidade dele no loop.
   - **De 6 a 10 perguntas prováveis** delimitadas pelas áreas de foco, cada uma com uma linha de "como seria uma resposta forte".
   - **De 3 a 5 sinais de alerta a investigar** , da lista de sinais de alerta do registro do candidato. Incluo uma pergunta para trazer à tona cada sinal.
   - **Temas de referência** , tópicos para uma futura ligação de referência (caso o processo avance).
   - **Rubrica de pontuação** , por pergunta: escala de 0 a 3 com exemplos, atrelada ao framework de níveis do contexto de pessoas para esse nível.
7. **Escrevo em `interview-loops/{candidate-slug}.md`.** Adiciono uma nova seção datada `## Resumo do entrevistador , {nome do entrevistador} , {YYYY-MM-DD}`, nunca sobrescrevo. Arquivo ausente? Crio com um cabeçalho e a seção do resumo. Escrita atômica (`*.tmp` → renomeação).
8. **Adiciono a `outputs.json`** , `{ id, type: "interview-prep", title, summary, path: "interview-loops/{candidate-slug}.md", status: "draft", createdAt, updatedAt }`, escrita atômica.
9. **Resumo para o usuário** , um parágrafo: entrevistador indicado, áreas de foco, as 3 principais perguntas, caminho do arquivo do loop.

## Nunca invento

- Toda afirmação sobre o candidato no resumo de histórico precisa remeter ao registro do candidato. DESCONHECIDO lá é DESCONHECIDO aqui.
- Nunca elaboro perguntas que investiguem atributos de classe protegida.
- Nunca gero preparação para o lado do candidato (o que o candidato deveria dizer), essa habilidade é só para o lado do entrevistador.

## Saídas

- `interview-loops/{candidate-slug}.md` (com adição de conteúdo; criado se ausente).
- Adição em `outputs.json` com tipo `interview-prep`.
