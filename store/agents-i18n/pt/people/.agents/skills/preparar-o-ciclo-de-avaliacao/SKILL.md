---
name: preparar-o-ciclo-de-avaliacao
title: "Preparar o ciclo de avaliação"
description: "Preparo o seu próximo ciclo de avaliação de desempenho: modelo de autoavaliação, modelo para gestores, documento de calibração e o cronograma completo. Tudo ancorado no seu ritmo de avaliações e no seu framework de níveis, para que não pareça genérico."
version: 1
category: Pessoas
featured: yes
image: busts-in-silhouette
integrations: [googledocs, notion]
---


# Preparar o Ciclo de Avaliação

## Quando usar

- Explícito: "prepare o ciclo de avaliação", "as avaliações do T{N} estão começando",
  "monte os modelos de avaliação", "configure o próximo ciclo de avaliação".
- Implícito: acionado por `weekly-people-review` quando a data do
  próximo ciclo em `context/people-context.md` está dentro da janela de antecedência.
- Frequência: uma vez por ciclo. Fundador quer atualizar no meio do ciclo?
  Rode de novo, substituindo o anterior.

## Conexões que preciso

Faço o trabalho externo pelo Composio. Antes de rodar esta habilidade, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu nomeio a categoria, peço para você conectá-la na aba Integrações e paro.

- **Documentos (Google Docs, Notion)** , compartilhar os modelos com gestores e colaboradores individuais. Opcional.
- **Plataforma de RH (Gusto, Deel, Rippling, Justworks)** , buscar a equipe atual para a calibração. Opcional.

Essa habilidade elabora os materiais localmente, então conexões faltando não me bloqueiam, eu simplesmente não distribuo os modelos automaticamente.

## Informações que preciso

Primeiro leio o seu contexto de pessoas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar texto) e espero.

- **Ritmo do ciclo de avaliação** , Obrigatório. Por que preciso: molda o cronograma e o identificador do ciclo. Se estiver faltando, pergunto: "As avaliações são anuais, semestrais ou trimestrais, e quando começa e termina o próximo ciclo?"
- **Framework de níveis** , Obrigatório. Por que preciso: os prompts e rubricas são mapeados por atributos de cada nível. Se estiver faltando, pergunto: "Como você descreveria cada nível, o que é escopo, autonomia e impacto do L1 ao L5?"
- **Escala de avaliação** , Opcional. Por que preciso: o modelo para gestores usa a sua escala em vez de uma genérica. Se você não tiver isso, sigo com um padrão de quatro faixas e um "a definir" no lugar da sua escala.
- **Faixas salariais** , Opcional. Por que preciso: permite que o documento de calibração sinalize mudanças salariais que ultrapassam os limites das faixas. Se você não tiver isso, sigo com "a definir" na checagem salarial.
- **Equipe atual** , Obrigatório. Por que preciso: o documento de calibração lista quem está avaliando quem. Se estiver faltando, pergunto: "Conecte sua plataforma de RH para eu buscar a equipe, ou cole a lista atual da equipe."

## Passos

1. **Leio o documento de contexto de pessoas:**
   `context/people-context.md`. Faltando ou vazio? Aviso o
   usuário para rodar `set-up-my-people-info` primeiro, paro. Leio
   **framework de níveis**, **faixas salariais** (para a checagem
   de calibração), **ritmo do ciclo de avaliação**, **notas de voz**.
2. **Leio a configuração:** `config/context-ledger.json`. Ritmo do ciclo de avaliação
   não definido? Uso o de `context/people-context.md`. Fonte da equipe é
   `connected-hr-platform`? Busco a equipe atual via `composio search hris`.
3. **Resolvo o identificador do ciclo.** Padrão `YYYY-q{N}` (ex.:
   `2026-q2`) para trimestral, `YYYY-h{N}` para semestral, `YYYY`
   para anual. Pergunto ao usuário se o padrão não combina com a
   nomenclatura interna dele.
4. **Produzo quatro materiais** em um único arquivo markdown:

   - **Modelo de autoavaliação** , blocos de prompts delimitados pelo
     framework de níveis. Uma seção por atributo de nível (escopo, autonomia,
     ofício, colaboração, impacto), com 1 a 2 perguntas abertas cada uma. Mantenho
     as perguntas curtas, o time inicial de um fundador não vai escrever
     autoavaliações de 1500 palavras, e nem eu quero que escreva.

   - **Modelo de avaliação para gestores** , mesma estrutura de atributos,
     mais uma rubrica geral de avaliação baseada na escala de
     avaliação do ciclo (se `context/people-context.md` definir uma) e
     um sinalizador de prontidão para promoção por pessoa. Incluo uma seção para
     "exemplos específicos observados neste ciclo", baseada em evidências, não
     em impressões.

   - **Documento de calibração** , visão cross-team para:
     - Consistência de nivelamento (colaboradores individuais L3 avaliados com
       o mesmo padrão entre times?).
     - Checagem de sanidade de aumento salarial (existem faixas salariais? sinalizo qualquer
       mudança salarial proposta que ultrapasse os limites das faixas).
     - Superfície de candidatos a promoção (quem foi sinalizado como
       pronto para promoção; cruzo com tempo-no-nível de
       `context/people-context.md`, se definido).

   - **Cronograma** , marcos datados de hoje até a entrega:
     autoavaliações a entregar → avaliações de gestores a entregar → reunião de
     calibração → cartas de remuneração finalizadas → 1:1s de entrega realizados. Derivo
     datas concretas da janela de início/fim do ciclo; marco qualquer data que precise
     de input do fundador.

5. **Checagem de voz.** Extraio notas de voz de `context/people-context.md`,
   os prompts dos modelos e o documento de calibração devem soar como a
   voz de RH do fundador, não um "RH-ês" genérico.

6. **Escrevo** em `review-cycles/{cycle-slug}.md` de forma atômica
   (`*.tmp` → renomeação). Estrutura: Visão geral do ciclo → Cronograma →
   Modelo de autoavaliação → Modelo de avaliação para gestores → Documento de calibração.

7. **Adiciono a `outputs.json`** , leio o array existente, adiciono
   `{ id, type: "review-cycle", title, summary, path, status: "draft",
   createdAt, updatedAt }`, escrita atômica. Status fica em `draft`
   até o fundador aprovar a estrutura do ciclo, muda
   para `ready` quando ele der o sinal verde.

8. **Resumo para o usuário** , um parágrafo cobrindo o identificador do ciclo,
   os destaques do cronograma, o caminho do pacote. Encerro com: "Isto são
   rascunhos. Revise os modelos e o cronograma, depois me diga
   para marcar como pronto e eu mudo o status, nada vai para o time até
   você dar o aval."

## Nunca invento

Não invento framework de níveis ou escala de avaliação que o fundador
não escreveu. Se a seção de nivelamento de `context/people-context.md` estiver `TBD`,
aviso o usuário: "Posso montar prompts genéricos, mas os modelos ficam
muito melhores quando `draft-leveling-framework` já foi rodado." Só sigo
com um modelo genérico claramente marcado se o usuário pedir explicitamente.

## Saídas

- `review-cycles/{cycle-slug}.md`
- Adição em `outputs.json` com tipo `review-cycle`.
