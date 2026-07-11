---
name: escrever-um-case-de-sucesso
title: "Escrever um case de sucesso"
description: "Transformo o sucesso de um cliente em um case de sucesso que você pode colocar no seu site ou entregar para vendas. Estruturo como desafio, abordagem e resultados com números reais na sua voz. Qualquer número que eu não consiga verificar fica marcado para você confirmar."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [notion, airtable]
---


# Escrever um case de sucesso

## Quando usar

- Explícito: "redija um case de sucesso do {cliente}", "escreva a
  história do {cliente}", "transforme esta entrevista em um case de sucesso".
- Implícito: depois que o agente de SDR / vendas sinaliza um cliente fechado
  disposto a servir de referência + o fundador aprova.
- Um case de sucesso por cliente por trimestre = cadência razoável.

## Conexões que eu preciso

Executo trabalho externo através do Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Faltando → nomeio a categoria, peço para você conectá-la na aba Integrações, paro.

- **Banco de notas (Airtable, Notion)**  -  puxa a entrevista do cliente, o depoimento ou o registro de notas. Obrigatório (ou você cola o material de origem).

Se nenhum dos dois estiver conectado e você não puder colar a entrevista, eu paro e peço para você conectar o Airtable ou o Notion.

## Informações que eu preciso

Leio seu contexto de marketing primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Seu posicionamento**  -  Obrigatório. Por que preciso: cases de sucesso têm que reforçar o posicionamento, não desviar dele. Se faltar, pergunto: "Quer que eu redija seu posicionamento primeiro? É uma skill só, leva uns cinco minutos."
- **Sua voz e CTA principal**  -  Obrigatório. Por que preciso: o CTA de fechamento combina com o que todas as outras páginas pedem. Se faltar, pergunto: "Conecte sua caixa de enviados para eu amostrar sua voz, e me diga a única ação que o leitor deve tomar depois de ler o case de sucesso."
- **O cliente**  -  Obrigatório. Se faltar, pergunto: "De qual cliente é este case de sucesso, nome mais uma descrição de uma linha?"
- **A entrevista, o depoimento ou as notas**  -  Obrigatório. Por que preciso: não vou fabricar citações nem métricas. Se faltar, pergunto: "Envie a gravação da entrevista, cole o depoimento, ou me aponte para o registro do cliente no Airtable ou no Notion."
- **Números reais de antes / depois**  -  Obrigatório para um case de sucesso forte. Se faltar, pergunto: "Que mudança mensurável esse cliente viu, e em qual período? Se você não tiver, eu sigo com TBD."

## Passos

1. **Ler o documento de posicionamento**:
   `context/marketing-context.md`. Se estiver faltando,
   paro. Peço para você rodar `set-up-my-marketing-info` primeiro. Cases
   de sucesso devem reforçar o posicionamento  -  sem desvios.
2. **Ler a configuração**: `config/site.json` (voz / CTAs da marca).
3. **Localizar o material de origem.** Preferência de modalidade:
   - CRM / planilha conectados via Composio  -  rodo `composio search
     crm` ou `composio search spreadsheet` (ex.: Airtable) para encontrar
     o registro do cliente + as notas da entrevista anexadas.
   - Transcrição da entrevista ou depoimento colados.
   - URL de um depoimento / avaliação publicados.
   Se nada disso existir, faço UMA pergunta nomeando as modalidades acima.
4. **Extrair os fatos.** Monto a lista de fatos:
   - Nome do cliente, setor, tamanho, cargo do entrevistado.
   - Desafio (dor específica, na linguagem textual do cliente
     sempre que possível).
   - Métricas do estado anterior (o que quebrava, com que frequência, quanto custava).
   - Abordagem (o que fizeram com o produto  -  funcionalidades específicas,
     mudanças de fluxo de trabalho).
   - Resultados (números, período, desfechos específicos).
   - Citações destacadas (textuais, com atribuição).
5. **Sinalizar números faltantes.** Todo resultado sem número recebe
   a marca TBD para o fundador verificar com o cliente. Nada de
   fabricar métricas.
6. **Redigir o case de sucesso** na estrutura clássica:
   - Título com o resultado principal (ex.: "Como a Acme cortou o churn em 40%").
   - Resumo de um parágrafo.
   - Seção do desafio.
   - Seção da abordagem.
   - Seção dos resultados (números logo no início).
   - 2-3 citações destacadas.
   - Chamada para ação alinhada ao CTA principal do documento de posicionamento.
7. **Escrever** em `case-studies/{customer-slug}.md` atomicamente, com
   bloco de front-matter: customer, industry, headlineResult, status.
8. **Anexar em `outputs.json`**  -  `{ id, type: "case-study", title,
   summary, path, status: "draft", createdAt, updatedAt }`.
9. **Resumir para você**  -  resultado principal, quaisquer números em TBD que
   precisem de confirmação do fundador/cliente, caminho do arquivo.

## Nunca inventar

Nunca fabrico citação, métrica ou resultado de cliente. Se a fonte
não tiver o dado, marco TBD. Faço contraponto se o fundador quiser
"arredondar" um número para algo mais bonito que a realidade.

## Saídas

- `case-studies/{customer-slug}.md`
- Anexa em `outputs.json` com tipo `case-study`.
