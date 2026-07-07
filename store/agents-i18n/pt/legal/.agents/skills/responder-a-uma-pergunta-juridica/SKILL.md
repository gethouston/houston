---
name: responder-a-uma-pergunta-juridica
title: "Responder a uma pergunta jurídica"
description: "Obtenha uma resposta rápida para uma pergunta jurídica, como 'preciso de um NDA com os investidores?' ou 'a GDPR se aplica a mim?'. Você recebe um memorando curto com a resposta, o raciocínio, as fontes e os próximos passos. Perguntas sensíveis ou incomuns são sinalizadas para um advogado de verdade."
version: 1
category: Consultoria
featured: yes
image: scroll
integrations: [stripe]
---


# Responder a uma Pergunta Jurídica

## Quando usar

- "preciso de um NDA com os investidores?" , normalmente não, investidores em estágio de pitch recusam.
- "preciso de um DPA com {fornecedor}?" , depende dos dados e da região.
- "a GDPR se aplica a mim?" , depende de visitantes/clientes na UE e dos dados envolvidos.
- "posso usar a logo desse cliente na minha landing page?" , depende da cláusula de direitos de marketing do MSA.
- "preciso registrar um 83(b)?" , provavelmente sim, dentro de 30 dias da emissão das ações. Prazo rígido.
- Qualquer "preciso de X?" ou "X se aplica?" cabe em um memorando curto.

## Passos

1. **Leia o contexto compartilhado.** Carregue o `legal-context.md` para saber a entidade, a geografia dos dados dos usuários atuais, os contratos vigentes, a postura de risco do fundador e as regras de escalonamento. Leia também os registros anteriores relevantes em `advice-memos/`, não responda de novo algo que já foi decidido.

2. **Esclareça a pergunta (no máximo uma pergunta de acompanhamento).** Se a pergunta depender de um fato que não está no contexto, faça UMA pergunta pontual com uma dica da melhor forma de responder. Exemplos:
   - "A GDPR se aplica?" → "Você tem análise de dados (analytics) na sua landing page e algum visitante da UE? Se a sua ferramenta de analytics estiver conectada, posso checar em 30 segundos."
   - "Preciso de um DPA com {fornecedor}?" → "Que dados o {fornecedor} acessa, dados pessoais de clientes, dados de pagamento, dados de funcionários ou só documentos internos da sua empresa?"
   Não faça mais de uma pergunta. Pergunta ampla → delimite ("vamos focar em {subpergunta}").

3. **Pesquise se necessário.** Para perguntas que citam regulamentações, checklists, padrões de mercado, use `composio search web-search` (ou similar, descoberto em tempo real) para buscar fontes confiáveis: texto primário da lei/regulamentação, orientações da EDPB / IRS / SEC / USPTO, checklists jurídicos respeitados para fundadores (Capbase, Andrew Bosin, Promise Legal, YC, Common Paper). Cite cada fonte no texto. Nada de "provavelmente", declare a resposta ou marque como DESCONHECIDO.

4. **Redija o memorando (cerca de 200 a 400 palavras, direto, começando com verbos).** Estrutura:

   1. **Pergunta** , a pergunta do fundador em uma frase, de preferência literal.
   2. **Resposta curta** , um parágrafo. Primeira frase é a conclusão ("Sim", "Não", "Depende, aqui está a regra"). Sem enrolação. Se depende, apresente duas ou três bifurcações e o que decide entre elas.
   3. **Contexto** , um parágrafo: por que isso se aplica a esse fundador. Referencie a entidade (C-corp de Delaware), o estágio (semana zero, pré-receita / um cliente), a stack (Stripe, Google Workspace), qualquer contrato vigente relevante ou geografia dos dados.
   4. **Fontes citadas** , em tópicos. Cada uma com uma linha explicando por que importa. Lei primária > orientação de órgão regulador > checklist confiável. De 2 a 5 fontes, nunca Wikipedia.
   5. **Próximo passo** , uma ação concreta em linguagem simples. Exemplos: "Redija um DPA com esse fornecedor.", "Adicione esse fornecedor à sua lista de fornecedores de privacidade.", "Registre o 83(b) dentro de {N} dias, posso acompanhar esse prazo."
   6. **Aviso de decisão de julgamento** , "Isso é uma opinião fundamentada, não uma consultoria jurídica final. Escale para um advogado externo se {condição específica, por exemplo dados relacionados a saúde, cliente é uma entidade regulada, negócio acima de US$ 100 mil}."

5. **Sinalize `attorneyReviewRequired: true`** se a pergunta tocar em:
   - HIPAA, PCI-DSS, COPPA, dados biométricos, controles de exportação.
   - Transferências internacionais de dados com mecanismo fora do padrão.
   - Decisões de tratamento tributário (elegibilidade para QSBS, mecânica de registro do 83(b) além do próprio prazo, crédito de P&D).
   - Ofertas de valores mobiliários além do SAFE padrão ou rodada com preço definido.
   - Direito trabalhista além do trio at-will / carta de oferta / CIIAA.
   - Qualquer coisa criminal, de fiscalização regulatória ou próxima de litígio.

6. **Grave de forma atômica** em `advice-memos/{slug}-{YYYY-MM-DD}.md` , grave em `{path}.tmp` e depois renomeie. Slug = versão curta em kebab-case da pergunta (ex: `gdpr-applies-to-landing-page`, `do-i-need-nda-with-investors`, `dpa-with-stripe`).

7. **Adicione ao `outputs.json`.** Leia, combine e grave de forma atômica:

   ```json
   {
     "id": "<uuid v4>",
     "type": "advice-memo",
     "title": "Advice  -  <question short form>",
     "summary": "<2-3 sentences  -  the bottom line + the next move>",
     "path": "advice-memos/<slug>-<YYYY-MM-DD>.md",
     "status": "ready",
     "attorneyReviewRequired": <true | false>,
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

   (Os memorandos de orientação saem como `ready`, factuais e citados; o fundador decide se age, não se aprova o rascunho.)

8. **Resuma para o usuário.** Um parágrafo curto em linguagem simples: a conclusão, o próximo passo e se um advogado de verdade deveria olhar. Nunca mencione nomes de arquivos, caminhos, ou onde o memorando está guardado, apenas entregue a resposta.

## Saídas

- `advice-memos/{slug}-{YYYY-MM-DD}.md`
- Adiciona ao `outputs.json` com `type: "advice-memo"`.
