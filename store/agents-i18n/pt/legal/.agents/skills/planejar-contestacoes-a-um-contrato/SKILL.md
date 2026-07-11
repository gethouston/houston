---
name: planejar-contestacoes-a-um-contrato
title: "Planejar contestações a um contrato"
description: "Depois de revisar um contrato, planeje exatamente o que contestar. Eu classifico os pontos em indispensáveis, desejáveis e não vale a pena brigar, escrevo o texto exato que você pode colar no seu e-mail de contraproposta, e adiciono uma alternativa caso a outra parte diga não. Você precisa ter revisado o contrato antes."
version: 1
category: Contratos
featured: no
image: scroll
---

# Planejar Contestações a um Contrato

## Quando usar

- "Redija a estratégia de redline para o contrato da {contraparte}" / "no que eu deveria contestar?" / "priorize os redlines, temos pouca margem de negociação".
- Depois que `review-a-contract` (mode=full) mostra cláusulas Amarelas e Vermelhas, o fundador precisa de uma sequência de negociação.

Execute uma vez por versão do contrato após a revisão. Se a contraparte fizer uma contraproposta → execute novamente na nova versão.

## Passos

1. **Leia o contexto compartilhado.** Carregue o `legal-context.md` para a postura de risco do fundador e as regras de escalonamento. Carregue `config/posture.json` para as posições de limite por cláusula.

2. **Leia a revisão anterior.** Encontre o `contract-reviews/{counterparty-slug}-{YYYY-MM-DD}.md` correspondente. Se estiver faltando → pare e pergunte ao usuário em linguagem simples: "Eu ainda não revisei esse contrato. Quer que eu faça isso primeiro?" Não prossiga até que isso esteja feito. Extraia a tabela completa de cláusulas (Verde / Amarelo / Vermelho + texto atual + padrão de mercado).

3. **Pergunte duas coisas ao fundador se não souber.** Ambas em uma única mensagem, não em dois turnos:
   - **Objetivo do negócio** , fechar rápido / proteger propriedade intelectual / limitar responsabilidade / margem de negociação para desistir / manter opcionalidade para rodadas futuras?
   - **Poder de negociação da contraparte** , quem é o peso-pesado? O cliente precisa disso neste trimestre, ou existem 3 outros negócios em andamento com ACV parecido? Leitura honesta.

4. **Classifique toda cláusula Amarela e Vermelha em três níveis:**

   - **Redlines indispensáveis** , não assina sem. Padrões da semana zero do fundador: limite de responsabilidade ilimitado substituído por um limite ancorado nas taxas; cessão de propriedade intelectual do produto principal eliminada; indenização unilateral contra nós tornada mútua; ressalva de treinamento de IA sobre nossos dados eliminada; não-concorrência sobre nós eliminada. Ajuste conforme a postura e o poder de negociação do fundador.
   - **Redlines desejáveis** , contestar se houver poder de negociação, deixar passar se não. Exemplos: rescisão por conveniência com aviso de 30 dias em vez de 60, SLA de notificação de violação mais amplo, direitos mais amplos de saída / recuperação de dados.
   - **Pode deixar passar** , itens Amarelos marcados como "manter como está, é aceitável". Uma linha de justificativa por item para o fundador saber por que não está contestando.

5. **Escreva o texto exato do redline para cada indispensável.** Não "peça um limite de responsabilidade", o texto de substituição de fato. Exemplo:

   > **Cláusula 8.2 (Limite de Responsabilidade).** Substituir
   > "A RESPONSABILIDADE DE CADA PARTE SERÁ ILIMITADA" por
   > "A RESPONSABILIDADE AGREGADA DE CADA PARTE NÃO EXCEDERÁ OS
   > VALORES PAGOS OU DEVIDOS NOS DOZE (12) MESES ANTERIORES À
   > RECLAMAÇÃO." Padrão de mercado para negócios de SaaS na nossa
   > faixa de ACV; responsabilidade ilimitada é motivo para desistir.

   Uma linha de justificativa por indispensável que o fundador pode colar literalmente no e-mail de contraproposta.

6. **Para cada indispensável, inclua uma escada de alternativas.** Se não aceitarem o indispensável → qual é o próximo passo aceitável? Ordem da melhor opção para nós até a última aceitável. Exemplo para o limite de responsabilidade: `1x as taxas anuais` → `taxas de 12 meses` → `2x as taxas anuais` → `2x as taxas anuais mas só para ressalvas de propriedade intelectual / violação`.

7. **Escreva o enquadramento do pedido / oferta.** Frases concretas que o fundador cola no e-mail de resposta:
   - "Podemos assinar essa semana se conseguirmos resolver os três itens abaixo; o resto está aceitável."
   - Liste os 3 indispensáveis no texto (redline + justificativa).
   - "Os demais {N} pontos que sinalizamos na nossa revisão estão aceitáveis como estão."

8. **Sinalize `attorneyReviewRequired: true`** se:
   - Qualquer indispensável exigir linguagem de propriedade intelectual, valores mobiliários, ou privacidade sem citação de padrão de mercado.
   - A contraparte já recusou o indispensável em uma rodada anterior (o fundador está considerando aceitar).
   - Negócio > US$ 100 mil de ACV.
   - Qualquer cláusula na revisão marcada como `UNKNOWN`.

9. **Redija o plano (markdown, cerca de 500 a 800 palavras).** Estrutura:

   1. **Cabeçalho** , contraparte, tipo de contrato, data da revisão, objetivo, leitura do poder de negociação.
   2. **Redlines indispensáveis** , lista numerada. Cada item: texto atual (citado), texto de substituição (literal), justificativa (uma frase), escada de alternativas.
   3. **Redlines desejáveis** , lista numerada. Cada item: texto atual, alvo, justificativa de uma linha, contestar ou deixar passar dado o poder de negociação.
   4. **Pode deixar passar** , em tópicos. Uma linha de justificativa por item.
   5. **Enquadramento do pedido / oferta** , parágrafo pronto para colar.
   6. **Sinalização de revisão por advogado** , sim / não + motivo se sim.
   7. **Próximo passo** , "enviar isso para a contraparte", "escalar", ou "aguardar {informação específica necessária}".

10. **Grave de forma atômica** em `redline-plans/{counterparty-slug}-{YYYY-MM-DD}.md` , grave em `{path}.tmp` e depois renomeie.

11. **Adicione ao `outputs.json`.** Leia, combine e grave de forma atômica:

    ```json
    {
      "id": "<uuid v4>",
      "type": "redline-plan",
      "title": "Redline plan  -  <counterparty>",
      "summary": "<2-3 sentences  -  must-have count + the top one + framing>",
      "path": "redline-plans/<slug>-<YYYY-MM-DD>.md",
      "status": "draft",
      "attorneyReviewRequired": <true | false>,
      "createdAt": "<ISO-8601>",
      "updatedAt": "<ISO-8601>"
    }
    ```

12. **Resuma para o usuário.** Um parágrafo curto em linguagem simples: quantos indispensáveis, o mais importante, a linha de oferta que podem colar, e o próximo passo. Nunca cite arquivos ou caminhos.

## Saídas

- `redline-plans/{counterparty-slug}-{YYYY-MM-DD}.md`
- Adiciona ao `outputs.json` com `type: "redline-plan"`.
