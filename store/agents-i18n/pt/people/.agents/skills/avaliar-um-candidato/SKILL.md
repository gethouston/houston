---
name: avaliar-um-candidato
title: "Avaliar um candidato"
description: "Avalio um candidato em relação a uma vaga aberta. Cole um currículo ou compartilhe uma URL do LinkedIn, e eu te dou uma nota conforme a rubrica, as evidências por trás dela, os sinais de alerta e o que explorar nas entrevistas. Ramifica de acordo com `source`: `resume` ou `linkedin`."
version: 1
category: Pessoas
featured: yes
image: busts-in-silhouette
integrations: [googlesheets, googledrive, linkedin, firecrawl]
---


# Avaliar um candidato

Dois caminhos, mesmo resultado: um arquivo de candidato por pessoa, avaliado conforme a rubrica da vaga. Escolha `source` conforme o que você tem em mãos.

## Quando usar

- `source=resume` - "faça a triagem deste currículo", "faça a triagem da pilha de currículos para {role}", "classifique estes currículos", "quem é mais forte na pilha". Suporta uso único e em lote.
- `source=linkedin` - "avalie {LinkedIn URL}", "o candidato serve para {role}", "avalie este perfil", "0-100 neste LinkedIn". Um por chamada. Lote = rodar várias vezes.

Ambos encadeiam com `prep-an-interviewer` e `debrief-an-interview-loop`, que esperam que `candidates/{slug}.md` já exista.

## Conexões de que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma → eu nomeio a categoria, peço para você conectá-la na aba Integrações, e paro.

- **Arquivos (Google Drive)** - recolher os PDFs de currículo que você enviar. Obrigatório quando a fonte é currículo.
- **Coleta na web (Firecrawl)** - ler URLs públicas do LinkedIn ou de perfis. Obrigatório quando a fonte é LinkedIn.
- **Planilhas (Google Sheets, Airtable)** - escrever de volta a pilha classificada, se você quiser uma. Opcional.
- **ATS (Ashby, Greenhouse, Lever, Workable)** - eliminar duplicados e escrever de volta o status do candidato. Opcional.

Se nenhuma das categorias obrigatórias estiver conectada, paro e peço para você conectar a que corresponde à sua fonte.

## Informações de que preciso

Leio primeiro o seu contexto de pessoas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Rubrica da vaga** - Obrigatório. Por que preciso: avalio cada candidato conforme os seus requisitos essenciais. Se faltar, pergunto: "Para qual vaga e nível é esse candidato, e quais são os três requisitos essenciais?"
- **Currículo ou perfil** - Obrigatório. Por que preciso: não tenho nada para avaliar sem isso. Se faltar, pergunto: "Coloque o currículo na pasta conectada, ou cole a URL do LinkedIn."
- **Nome do candidato** - Opcional. Por que preciso: organiza o arquivo direitinho. Se você não tiver essa informação, eu tiro do currículo ou do perfil e sigo em frente.

## Parâmetro: `source`

- `resume` - analisa PDF(s) de currículo do Google Drive / Dropbox conectado (ou de arquivos colados) via ferramenta de documentos do Composio. Capaz de lote: N currículos → cada um com registro próprio E um resumo classificado. Faixa de resultado: **aprovado / limítrofe / reprovado**.
- `linkedin` - coleta a URL do LinkedIn ou de perfil público via ferramenta de coleta na web do Composio (Firecrawl). Resultado: total de 0-100 + 4 a 6 subnotas (adequação de nível, adequação de área, escopo, tempo de casa, sinal cultural) com evidências do perfil citadas por subnota.

## Passos

1. **Leio o registro**, preencho lacunas com UMA pergunta objetiva.
2. **Leio `context/people-context.md`.** Se estiver ausente ou vazio → digo a você: "Primeiro preciso do contexto de pessoas, rode a habilidade configurar-minhas-informacoes-de-pessoas." Paro. Busco o framework de níveis para o nível alvo.
3. **Leio a vaga.** Abro `reqs/{role-slug}.md` para a rubrica de critérios. Se estiver ausente → faço UMA pergunta objetiva ("Qual vaga? Top 3 requisitos essenciais?") e escrevo `reqs/{role-slug}.md`.
4. **Ramifico conforme `source`:**

   - **Se `source = resume`:**
     1. Localizo os currículos. Se anexados ou pasta conectada → rodo `composio search docs` para descobrir o slug da ferramenta de documentos (Google Drive / Dropbox) e listo os PDFs. Se os caminhos foram colados → uso esses. Se nenhum dos dois → faço UMA pergunta nomeando a melhor modalidade ("Conecte o Google Drive / Dropbox em Integrações, ou cole os arquivos de currículo.") e paro.
     2. Analiso cada currículo. Executo o slug de documentos para extrair o texto. Busco campos estruturados por candidato: nome, contato; formação (escola, diploma, datas); cargos (empresa, título, datas, tempo de casa); habilidades (declaradas + deduzidas das descrições de cargo); projetos / publicações notáveis. Marco campos ambíguos como NÃO SE SABE, nunca deduzo.
     3. Avalio conforme a rubrica. Por candidato, pontuo cada critério como aprovado / limítrofe / reprovado com um motivo de uma linha citando evidência do currículo (ou "não declarado no currículo" → NÃO SE SABE). Faixa geral. 3 a 5 sinais de alerta (padrão de tempo de casa, lacuna de habilidades vs. requisitos essenciais, lacunas não explicadas). Nunca sinalizo atributos de classe protegida.
     4. Escrevo um registro por candidato em `candidates/{candidate-slug}.md` (slug = kebab-case `{nome-sobrenome}`). Se o arquivo já existir → anexo uma nova seção datada `## Triagem {YYYY-MM-DD}`, nunca substituo. Por seção: Campos estruturados → Pontuação da rubrica → Faixa geral → Sinais de alerta → Próximo passo sugerido (entrevista / recusa com justificativa). Escrita atômica.
     5. Mais de um currículo → construo uma tabela de resumo classificado (nome → faixa → motivo de uma linha → caminho do candidato), incluo no texto de resumo de `outputs.json`.

   - **Se `source = linkedin`:**
     1. Analiso a URL. Aceito LinkedIn ou qualquer URL de perfil público. Derivo `{candidate-slug}` da URL ou do nome declarado (kebab-case `nome-sobrenome`).
     2. Descubro a ferramenta de coleta: `composio search web-scrape`. Se nada estiver conectado → digo qual categoria conectar e paro.
     3. Coleto os dados. Executo o slug. Extraio: título atual + empresa + tempo de casa; cargos anteriores (empresa, título, datas, tempo de casa); formação; habilidades (declaradas + deduzidas do cargo / título de destaque); atividade recente (posts, publicações, palestras); localização se declarada. Marco campos ambíguos como NÃO SE SABE. Se a coleta vier vazia ou bloqueada → digo isso, peço um resumo colado do perfil.
     4. Pontuo de 0 a 100 conforme a rubrica. Divido em 4 a 6 subnotas (por exemplo, adequação de nível, adequação de área, sinal de escopo, sinal de tempo de casa, sinal cultural). Cada subnota de 0 a 25 com um motivo de uma linha citando evidência do perfil. Total ≤ 100.
     5. Produzo: resumo do histórico (3 a 5 frases), total + subnotas com justificativa, 3 a 5 sinais de alerta para explorar nas entrevistas. Nunca deduzo atributos de classe protegida.
     6. Escrevo em `candidates/{candidate-slug}.md`. Se o arquivo já existir → anexo `## Nota do LinkedIn {YYYY-MM-DD}`, nunca substituo. Se não existir → crio com um cabeçalho inicial e depois a seção de pontuação. Escrita atômica.

5. **Anexo em `outputs.json`** com:
   ```json
   {
     "id": "<uuid v4>",
     "type": "candidate-evaluation",
     "title": "<source>  -  <candidate name or stack count>",
     "summary": "<2-3 sentences; for batch: counts by band + top 3>",
     "path": "candidates/<candidate-slug>.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>",
     "domain": "hiring"
   }
   ```
   Execuções em lote de currículos → uma entrada por lote com `path: "candidates/"`.
6. **Resumo.** Um parágrafo.
   - `resume`: quantidade avaliada, distribuição por faixa, top 3 nomeados com caminhos de arquivo.
   - `linkedin`: pontuação total, top 2 motivos para alta/baixa, top 2 sinais de alerta, caminho do arquivo do candidato.

## Resultados

- `candidates/{candidate-slug}.md` por candidato (anexado; criado se ausente).
- Anexos em `outputs.json` com `type: "candidate-evaluation"`, `domain: "hiring"`.

## O que eu nunca faço

- Deduzir ou pontuar atributos de classe protegida (raça, gênero, idade 40+, gravidez, deficiência, religião, origem nacional, orientação sexual, condição de veterano). Só a rubrica de critérios objetivos.
- Inventar credenciais, referências ou afirmações. Currículo / LinkedIn fraco ou bloqueado → marco NÃO SE SABE, peço para colar.
- Substituir seções anteriores do candidato, sempre anexo seções datadas.
- Decidir contratar ou não. Essa decisão é sua; eu classifico e sinalizo.
