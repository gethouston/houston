---
name: preparar-a-declaracao-anual-de-delaware
title: "Preparar a declaração anual de Delaware"
description: "Prepare-se para o seu relatório anual de Delaware e o imposto de franquia (com vencimento em 1º de março de cada ano). Eu calculo de duas formas e escolho a mais barata, que costuma ser de 10 a 100 vezes menor que o número assustador que Delaware mostra por padrão. Você recebe um guia passo a passo de exatamente o que preencher no site do estado. Você declara, eu preparo."
version: 1
category: Entidade
featured: no
image: scroll
integrations: [googledocs]
---


# Preparar a Declaração Anual de Delaware

Toda C-corp de Delaware deve o imposto de franquia e o relatório anual até **1º de março**. O cálculo online padrão usa Ações Autorizadas, cotando um número assustador, geralmente US$ 75 mil ou mais para uma startup padrão com 10 milhões de ações autorizadas. O **método de Capital com Valor Nominal Presumido** quase sempre gera um imposto bem menor (geralmente entre US$ 400 e US$ 1.000 para uma startup pequena). Calcule os dois, sinalize a economia.

## Quando usar

- "Prepare meu relatório anual de Delaware para {ano}."
- "O imposto de franquia de Delaware está chegando."
- Acionado por `track-deadlines-and-signatures` (scope=deadlines) quando o prazo de 1º de março entra na janela de 90 dias.
- O fundador recebeu uma fatura assustadora de Delaware e quer recalcular.

## Passos

1. **Leia o contexto compartilhado.** Leia `context/legal-context.md`.
   Se estiver faltando ou vazio, pergunte ao usuário em linguagem simples: "Preciso saber algumas informações básicas sobre a sua empresa primeiro (estado de constituição, ações autorizadas, diretores). Quer configurar isso agora?" Depois execute `set-up-my-legal-info` se disser sim. Pare até que isso esteja feito.

2. **Leia a configuração.** `config/entity.json` , confirme que
   `stateOfIncorporation === "DE"`. Se não for, responda: "Isso só se aplica a entidades de Delaware; a sua entidade está registrada em {estado}." Pare.

3. **Reúna os dados para a declaração.** Leia de `legal-context.md`:
   - Nome legal da entidade
   - Número de arquivo (número de arquivo estadual de Delaware, 7 dígitos)
   - Ações autorizadas (por classe de ação: ordinárias + quaisquer preferenciais)
   - Valor nominal por ação (normalmente US$ 0,0001 ou US$ 0,00001 para startups)
   - Nome e endereço do agente registrado
   - Data de constituição

   Mais dados para o recálculo (pergunte ao fundador se estiverem faltando, um de cada vez):
   - **Ações emitidas no fim do ano fiscal** (por classe). Busque via
     `composio search cap-table` (Carta / Pulley); se não estiver
     conectado, pergunte.
   - **Ativos totais no fim do ano fiscal** (do balanço patrimonial,
     linha de total de ativos). Se pré-receita com menos de US$ 50 mil em caixa, geralmente é só "caixa disponível".
   - **Diretores** , nome e cargo de cada membro do conselho.
   - **Executivos** , nome e cargo de cada um (no mínimo Presidente, Secretário,
     Tesoureiro; fundador único costuma acumular os três).
   - **Sede principal de negócios** , endereço (endereço residencial do fundador ou endereço do agente registrado servem).

4. **Rode os dois cálculos de imposto de franquia.**

   **Método A , Ações Autorizadas (padrão, geralmente mais alto):**
   - Até 5.000 ações: US$ 175 fixo (mínimo).
   - 5.001-10.000 ações: US$ 250 fixo.
   - Acima de 10.000 ações: US$ 250 + US$ 85 a cada 10.000 ações
     adicionais (ou fração), com teto de US$ 200 mil.
   - Startup com 10 milhões de ações autorizadas → aproximadamente US$ 85.165 por esse método.

   **Método B , Capital com Valor Nominal Presumido:**
   1. `assumedParValueCapital = (ativos totais / total de ações
      emitidas) * total de ações autorizadas`.
   2. Imposto = `US$ 400 a cada US$ 1.000.000 de assumedParValueCapital`
      (mínimo US$ 400; máximo US$ 200 mil).
   3. Startup com 10 milhões autorizadas, 8 milhões emitidas, US$ 100 mil
      em ativos totais → `(100000 / 8000000) * 10000000 = US$ 125.000` de valor nominal presumido
      → imposto de US$ 400 (bate no piso).

   Escolha o **menor** entre A e B. A lei de Delaware permite explicitamente
   a eleição do Capital com Valor Nominal Presumido. Cite **8 Del. C. §503**.

5. **Mostre os dois números e a economia.** Exemplo de destaque:
   > "Método padrão de Ações Autorizadas: US$ 85.165.
   > Método de Capital com Valor Nominal Presumido: US$ 400.
   > Economia: US$ 84.765. Escolha o Capital com Valor Nominal Presumido
   > na declaração, tem um botão de opção para isso no portal
   > de Delaware."

6. **Monte o pacote de envio.** Grave um único arquivo markdown em
   `annual-filings/de-{year}.md` com:

   - **Resumo** , entidade, ano, total devido (o menor entre os métodos A/B),
     eleição feita, prazo (1º de março de {ano}).
   - **Detalhe do cálculo** , os dois métodos, os dados de entrada, o resultado.
   - **Conteúdo do relatório anual** , nome da entidade, número de arquivo,
     sede principal de negócios, telefone, diretores (nome + endereço),
     executivos (nome + endereço + cargo), ações emitidas.
   - **Guia passo a passo do portal** , URL
     (https://corp.delaware.gov/paytaxes/), fazer login com o número de arquivo
     da entidade, selecionar relatório anual e imposto de franquia, informar
     executivos e diretores, **selecionar "Assumed Par Value" no
     botão de opção de eleição do imposto de franquia**, informar os ativos totais e as
     ações emitidas, pagar.
   - **Aviso de multa por atraso** , multa de US$ 200 + juros mensais de 1,5%;
     falha em declarar por dois anos consecutivos → entidade declarada nula.
   - **Lembretes** , renovação do agente registrado (fatura separada do
     agente), consentimento anual do conselho (processo separado).

7. **Grave de forma atômica** (`*.tmp` → renomear).

8. **Adicione ao `outputs.json`** , `{ id, type: "annual-filing",
   title, summary, path, status: "draft", createdAt, updatedAt,
   attorneyReviewRequired }`. Ative `attorneyReviewRequired: true`
   se o cap table tiver algo incomum , SAFEs / conversíveis não
   convertidos, várias classes de preferenciais, ações emitidas com
   valor nominal fora do padrão, ações de fundador ainda não emitidas no registro, ou
   qualquer divergência entre o cap table e as emissões aprovadas pelo conselho.

9. **Marque a linha do calendário como concluída** assim que o fundador confirmar que enviou. Atualize
   `deadline-calendar.json` na linha `type: "delaware-franchise-tax"` →
   `status: "done"`; a linha do próximo ano é criada em 1º de janeiro.

10. **Resuma para o usuário.** Linguagem simples. Mostre os dois valores do imposto, a economia, o prazo de 1º de março, o link para o site de envio de Delaware, e uma linha final: "Deixei preparado exatamente o que preencher. Acesse a página quando estiver pronto e siga os passos." Nunca cite arquivos ou caminhos.

## Saídas

- `annual-filings/de-{YYYY}.md`
- Adiciona ao `outputs.json` com `type: "annual-filing"`.
