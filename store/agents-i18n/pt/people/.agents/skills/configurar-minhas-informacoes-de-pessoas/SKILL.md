---
name: configurar-minhas-informacoes-de-pessoas
title: "Configurar minhas informações de pessoas"
description: "Me conte como você faz a gestão de RH: valores, níveis (para colaboradores individuais e gestores, de L1 a L5), faixas salariais, ritmo do ciclo de avaliações, políticas oficiais, regras de escalonamento, sua voz e seus limites inegociáveis, para que eu possa te dar rascunhos e respostas precisos. Este é o documento base que toda outra Ação de pessoas lê primeiro."
version: 1
category: Pessoas
featured: yes
image: busts-in-silhouette
integrations: [googlesheets, googledocs, notion]
---


# Configurar Minhas Informações de Pessoas

Um documento que toda habilidade do agente lê antes de produzir qualquer resultado
substancial: proposta, plano de melhoria de desempenho (PIP), resposta de política, pontuação de retenção, ciclo de
avaliação. Fica em `context/people-context.md`. Eu redijo, você decide. Nunca defino
faixas salariais nem travo o nivelamento sem o seu aval.

## Quando usar

- "monte o documento de contexto de pessoas" / "configure nosso contexto de pessoas" /
  "documente como fazemos RH".
- "atualize o documento de contexto de pessoas" / "nosso nivelamento mudou, ajuste o
  documento de contexto".
- "monte nosso framework de nivelamento" / "construa a escada de níveis" /
  "o que é um L3 versus um L4".
- Chamado implicitamente por qualquer habilidade que precise do documento e ele estiver
  faltando, só depois de confirmar com você.

## Conexões que preciso

Faço o trabalho externo pelo Composio. Antes de rodar esta habilidade, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu nomeio a categoria, peço para você conectá-la na aba Integrações e paro.

- **Plataforma de RH (Gusto, Deel, Rippling, Justworks)** , buscar a estrutura da equipe diretamente. Opcional.
- **Documentos (Notion, Google Docs)** , importar um manual ou documento de política já existente. Opcional.
- **Planilhas (Google Sheets)** , importar faixas salariais ou colar a equipe atual. Opcional.

Nenhuma integração é estritamente obrigatória, eu redijo a partir das suas respostas se nada estiver conectado.

## Informações que preciso

Primeiro leio o seu contexto de pessoas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar texto) e espero.

- **Empresa e estágio** , Obrigatório. Por que preciso: quem está pré-primeira-contratação recebe mais estrutura de apoio, quem tem 15+ pessoas recebe algo mais enxuto. Se estiver faltando, pergunto: "Qual é o nome da empresa, o que ela faz em uma linha, e quantas pessoas estão no time hoje?"
- **Valores** , Obrigatório. Por que preciso: toda definição de nível remete aos valores. Se estiver faltando, pergunto: "Quais são as quatro a seis coisas que você quer que este time represente, com suas próprias palavras?"
- **Intenção de nivelamento** , Obrigatório. Por que preciso: eu não escolho uma escada de níveis por você. Se estiver faltando, pergunto: "Você quer uma única trilha para colaboradores individuais, trilhas de colaborador individual mais gestor, ou ainda não está pronto para definir níveis?"
- **Posicionamento salarial** , Opcional. Por que preciso: as faixas moldam as cartas de remuneração e as propostas. Se você não tiver isso, sigo com "a definir" nas faixas salariais.
- **Roteamento de escalonamento** , Obrigatório. Por que preciso: questões de discriminação, assédio, salário e visto precisam de uma pessoa nomeada. Se estiver faltando, pergunto: "Para quem essas questões são encaminhadas? Existe um advogado trabalhista nomeado, ou devemos marcar como 'a definir' até você contratar um?"
- **Manual existente** , Opcional. Por que preciso: eu importo políticas em vez de inventá-las. Se você não tiver isso, sigo com "a definir" no acervo de políticas.
- **Limites inegociáveis** , Opcional. Por que preciso: molda as regras de contraproposta e outros rascunhos derivados. Se você não tiver isso, sigo com "a definir".

## Passos

1. **Leio `config/context-ledger.json`.** Preencho lacunas com uma
   pergunta única e direcionada.
2. **Leio o documento existente, se houver.** Se `context/people-context.md`
   existe, leio para que a execução seja uma atualização, não uma reescrita. Preservo
   partes já refinadas; mudo só o que estiver desatualizado ou for novo.
3. **Importação opcional.** Pergunto uma vez: "Você tem um manual, documento de
   política ou planilha de remuneração existente do qual eu deveria puxar informações? Consigo ler Notion, Google
   Docs ou Google Sheets, se você tiver conectado algum." Se sim, rodo
   `composio search docs` / `composio search sheets`, busco, cito
   a fonte por seção.
4. **Insisto nas regras de escalonamento, isso não pode ser inferido.** Pergunto
   diretamente: "Para quem vão as questões de discriminação / assédio / disputa
   salarial / visto? Uma pessoa nomeada, ou devemos marcar como
   'a definir'?" Sem valores padrão. Ainda sem advogado? A seção fica com `a definir,
   precisa de um advogado trabalhista contratado antes da primeira contratação`, e eu aviso você
   explicitamente sobre isso.
5. **Redijo o documento (~500 a 900 palavras, com posicionamento claro).** Seções, nesta ordem:
   1. **Valores da empresa** , 4 a 6 valores, definições de uma linha. Nas suas
      próprias palavras; sem clichês de cartaz de RH.
   2. **Estrutura da equipe** , quadro de pessoal por função, vagas abertas. Puxo do
      sistema de RH conectado, se disponível, senão colo o que for enviado.
   3. **Framework de nivelamento** , trilhas de colaborador individual e gestor com nomes de nível,
      expectativas resumidas, escopo de impacto, marcadores de senioridade por
      nível. Padrão L1 a L5; pergunto uma vez se você quer mais. Cada nível
      tem: nome (ex.: "Engenheiro Sênior"), um parágrafo de expectativas,
      escopo (time / função / organização / entre organizações), marcadores de senioridade
      (faixa aproximada de anos, direitos de decisão, tolerância a ambiguidade), e
      uma linha "Representa {valor X, valor Y} neste nível ao...", conectada à
      seção de valores.
   4. **Faixas salariais** , faixa por nível, posicionamento de equity, multiplicadores por
      localização. Aceito "a definir" com generosidade, fundadores no dia zero
      geralmente ainda não têm faixas definidas.
   5. **Ritmo do ciclo de avaliação** , anual / semestral / trimestral,
      data do próximo ciclo.
   6. **Acervo de políticas** , licenças, benefícios, despesas, trabalho remoto,
      viagens, equipamentos. Vinculo documentos de origem onde existirem; "a definir" onde
      não existirem.
   7. **Regras de escalonamento** , o que o agente responde, o que é encaminhado ao fundador e o que é
      encaminhado ao advogado. Nomeio o advogado / escritório ou escrevo "a definir,
      precisa de um advogado trabalhista contratado". Base para
      `answer-a-policy-question` e `draft-a-people-document`.
   8. **Notas de voz** , 4 a 6 tópicos sobre tom, padrões de saudação,
      frases proibidas, preferência de tamanho de frase. Do resumo de voz da
      configuração, mais `config/voice.md`, se existir.
   9. **Limites inegociáveis** , o que o time nunca faz (ex.: "nunca
      fazemos contraproposta em pedidos de demissão", "nunca publicamos salários",
      "sempre damos 30 dias de aviso antes de vencimentos de equity").
6. **Marco lacunas com honestidade.** Seção rasa? Escrevo `a definir , {o que
   você deveria trazer a seguir}`. Nunca invento. Principalmente nunca invento faixas
   salariais, roteamento de escalonamento, linguagem jurídica.
7. **Escrevo de forma atômica** em `context/people-context.md.tmp`, depois
   renomeio. Um único arquivo em `context/`. NÃO em `.agents/`. NÃO em
   `.houston/<agent>/`.
8. **Atualizo a configuração.** Defino
   `universal.positioning = { present: true, path:
   "context/people-context.md", lastUpdatedAt: <ISO> }` de forma atômica.
9. **Adiciono a `outputs.json`.** Entrada:
   ```json
   {
     "id": "<uuid v4>",
     "type": "people-context",
     "title": "People-context doc updated",
     "summary": "<2-3 frases, o que mudou nesta passagem + quais seções ainda estão a definir>",
     "path": "context/people-context.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>",
     "domain": "culture"
   }
   ```
   (Documento é um arquivo vivo; cada edição substancial é indexada para que o
   histórico de atualização apareça no painel.)
10. **Resumo.** Um parágrafo: o que mudou, quais seções ainda estão
    `a definir` (especialmente regras de escalonamento e faixas salariais), próximo passo exato.

## Saídas

- `context/people-context.md` (documento vivo).
- Adição em `outputs.json` com `type: "people-context"`,
  `domain: "culture"`.

## O que eu nunca faço

- Definir faixas salariais ou travar definições de nivelamento sem o seu aval.
- Redigir regras de escalonamento sem input explícito, pergunto ou marco `a definir`.
  Seção sensível e com implicações jurídicas.
- Escrever o documento em `.agents/` ou `.houston/<agent>/`, o observador de
  arquivos do Houston ignora esses caminhos. Sempre em `context/`.
