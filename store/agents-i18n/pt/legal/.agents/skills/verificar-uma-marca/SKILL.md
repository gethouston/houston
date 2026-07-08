---
name: verificar-uma-marca
title: "Verificar uma marca"
description: "Verifique rapidamente se um nome está livre para ser usado como marca. Eu pesquiso na base de dados oficial de marcas dos EUA por resultados exatos, semelhantes na pronúncia e semelhantes na aparência, depois classifico o risco como Baixo, Médio ou Alto e digo o que fazer a seguir. Aviso: isso é uma checagem rápida, não uma autorização jurídica completa, para isso você precisa de um advogado especialista em marcas de verdade."
version: 1
category: Propriedade intelectual
featured: no
image: scroll
integrations: [firecrawl]
---


# Verificar uma Marca

Não é um parecer de autorização, é uma checagem eliminatória (knockout). Responde "tem algum bloqueio óbvio?", não "está seguro registrar?". Essa segunda pergunta precisa de um advogado especialista em marcas.

## Quando usar

- "Faça a checagem eliminatória em {marca}."
- "{nome} está disponível como marca registrada?"
- Antes de qualquer gasto com branding, domínio, logomarca.
- Antes de registrar um pedido de intenção de uso 1(b).

## Passos

1. **Leia o contexto compartilhado.** Leia `context/legal-context.md`. Se estiver faltando ou vazio, pergunte ao usuário em linguagem simples: "Preciso saber algumas informações básicas sobre a sua empresa primeiro. Quer configurar isso agora?" Depois execute `set-up-my-legal-info` se sim. Pare até que isso esteja feito.

2. **Confirme a marca e as classes.** O fundador informa:
   - A **marca nominativa** proposta (elemento de design / logo à parte se for relevante, marcas de design precisam de busca própria).
   - As **classes de Nice** desejadas. A maioria dos fundadores de SaaS usa a **Classe 9** (software / apps para download) + **Classe 42** (SaaS / plataforma como serviço). Hardware de consumo com marca própria acrescenta a **Classe 35** (serviços de varejo) ou a classe do produto. Fundador em dúvida → proponha 9 + 42, confirme.

   Grave `config/trademark-prefs.json` com `{ classes, lastSearchedAt }` se for a primeira vez.

3. **Execute a checagem eliminatória no USPTO Trademark Center.** Execute `composio search uspto` ou `composio search trademark` para achar a ferramenta; o USPTO Trademark Center (lançado em janeiro de 2025) é o sistema oficial. Nenhuma ferramenta conectada → execute `composio search web-scrape` e consulte diretamente `https://tmsearch.uspto.gov/`.

   Quatro buscas por classe:

   - **Busca exata** , a `marca` como marca nominativa.
   - **Busca fonética** , equivalentes fonéticos (Kandi vs Candy, Fone vs Phone, Noot vs Newt, etc.).
   - **Busca visual** , troca de letras / transliteração (Lyft vs Lift, Tumblr vs Tumbler).
   - **Busca por raiz** , busque a raiz se a marca for composta (ex: "BrightCloud" → busque "Bright" e "Cloud").

4. **Classifique cada resultado.** Para cada resultado capture: número de série, marca completa, titular, descrição de produtos/serviços, classe, data de depósito, status (`LIVE` / `PENDING` / `ABANDONED` / `DEAD`). Resultado LIVE ou PENDING em classe sobreposta = bloqueio. ABANDONED ou DEAD = informativo (ainda é possível uma questão de marca de direito consuetudinário, não é bloqueio para registro).

5. **Avalie o risco.**
   - **Alto** , resultado LIVE/PENDING exato ou fonético, mesma classe. Ou resultado LIVE/PENDING com descrição de produtos quase idêntica.
   - **Médio** , resultado LIVE/PENDING exato em classe adjacente (ex: quer Classe 42 SaaS; existe resultado de software na Classe 9). Ou resultado LIVE/PENDING fonético/visual, mesma classe. Ou muitos resultados ABANDONED = campo concorrido.
   - **Baixo** , nenhum resultado LIVE/PENDING nas classes alvo ou adjacentes; poucos resultados ABANDONED/DEAD, ou produtos totalmente diferentes.

6. **Recomende o próximo passo.**
   - Baixo → registre o pedido de **intenção de uso 1(b)** assim que a marca estiver definida, ou continue usando e registre o 1(a) assim que estiver em comércio. Taxa do USPTO de aproximadamente US$ 350/classe no TEAS Plus.
   - Médio → **contrate um advogado de marcas para autorização completa** antes de registrar; estratégias de coexistência são possíveis.
   - Alto → **faça rebranding**, ou contrate um advogado de marcas para coexistência / acordos de consentimento. Não registre.

7. **Grave de forma atômica** em `tm-searches/{mark-slug}-{YYYY-MM-DD}.md` com:
   - Marca + classes pesquisadas + horário da pesquisa.
   - Avaliação de risco + justificativa de uma linha.
   - Tabela de resultados (busca exata, busca fonética, busca visual, busca por raiz) com número de série, marca, titular, classe, status.
   - Próximo passo recomendado.
   - **Divulgação de limites** , literal: "Esta é uma checagem eliminatória, não uma autorização completa. Cobre apenas registros federais do USPTO. Não cobre registros estaduais, marcas de direito consuetudinário, marcas estrangeiras, ou disponibilidade de domínio/perfil em redes sociais. Para resultados de Alto risco ou antes de registrar, contrate um advogado de marcas."

8. **Adicione ao `outputs.json`** , `{ id, type: "tm-search", title, summary, path, status: "ready", createdAt, updatedAt, attorneyReviewRequired }`. Ative `attorneyReviewRequired: true` para qualquer risco **Alto** (sempre) e qualquer risco **Médio** que o fundador pretenda seguir adiante.

9. **Resuma para o usuário.** Linguagem simples. Diga o risco (Baixo / Médio / Alto), o maior resultado encontrado (quem é o titular, o que vende), e o próximo passo ("registre quando estiver pronto" / "fale com um advogado de marcas primeiro" / "faça rebranding"). Nunca cite arquivos ou caminhos.

## Saídas

- `tm-searches/{mark-slug}-{YYYY-MM-DD}.md`
- Adiciona ao `outputs.json` com `type: "tm-search"`.
