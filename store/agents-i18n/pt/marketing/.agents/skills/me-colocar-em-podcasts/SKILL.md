---
name: me-colocar-em-podcasts
title: "Me colocar em podcasts"
description: "Encontro podcasts onde seu cliente ideal escuta e escrevo um pitch personalizado para cada um. Faço uma pré-seleção dos programas por afinidade de público, verifico se estão ativos e escrevo e-mails por programa com um gancho que menciona um episódio real. Nada de spam de modelo pronto, você envia da sua própria caixa de entrada."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [twitter]
---


# Me Colocar em Podcasts

## Quando usar

- Usuário: "me coloca em podcasts" / "prospecção de podcasts" / "encontrar programas para nosso cliente ideal" / "redigir pitches para {N} programas".
- Cadência mensal é natural, pode virar rotina.

## Conexões que preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar, verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações e paro.

- **Diretório de podcasts (Listen Notes)** - descobrir programas por afinidade de público. Obrigatório.
- **Caixa de entrada (Gmail, Outlook)** - captar a sua voz para os e-mails de pitch. Opcional, mas os rascunhos ficam sem graça sem isso.
- **X / Twitter** - opcional, puxar contexto do apresentador para deixar o gancho mais específico.

Se nenhum diretório de podcasts estiver conectado, eu paro e peço para você conectar o Listen Notes na aba Integrações.

## Informações que preciso

Eu leio primeiro o seu contexto de marketing. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > upload de arquivo > URL > colar) e espero.

- **Seu posicionamento** - Obrigatório. Por que preciso: o ângulo e a afinidade de público partem do posicionamento. Se estiver faltando, eu pergunto: "Quer que eu redija seu posicionamento primeiro? É uma skill, leva uns cinco minutos."
- **Sua voz** - Obrigatório para os e-mails de pitch. Se estiver faltando, eu pergunto: "Conecte sua caixa de enviados para eu captar sua voz, ou cole dois ou três e-mails que você já enviou."
- **O ângulo e o público-alvo** - Obrigatório. Por que preciso: define quais programas eu vou pré-selecionar. Se estiver faltando, eu pergunto: "Qual ângulo você quer usar no pitch, e para qual público, fundadores, operadores, investidores, compradores técnicos?"
- **Programas para excluir** - Opcional. Se estiver faltando, eu pergunto: "Algum programa que você já contatou ou quer pular? Se não tiver uma lista, eu sigo sem exclusões."

## Passos

1. **Ler o documento de posicionamento**: `context/marketing-context.md`. Ausente ou vazio -> parar, avisar o usuário para rodar `set-up-my-marketing-info` primeiro.

2. **Ler `config/voice.md` e `config/podcast-targets.json` (se existir).** `podcast-targets.json` ausente -> fazer uma pergunta direcionada:
   > "Qual ângulo você quer usar no pitch? Por exemplo, 'operações de SaaS para fundador solo', 'IA para contabilidade de back-office', 'bootstrapped até a lucratividade'. E qual público, fundadores, operadores, investidores, compradores técnicos? Vou registrar isso em `config/podcast-targets.json`."
   Capturar `{ angle, audience, excludeShows?, capturedAt }`.

3. **Descobrir podcasts alvo.** Rodar `composio search podcast` (ou `composio search listen-notes`) para encontrar a ferramenta de diretório de podcasts. Executar com ângulo + público, puxar de 10 a 20 candidatos. Nenhuma ferramenta de diretório conectada -> avisar ao usuário qual categoria conectar, parar. Nunca inventar programas.

4. **Classificar e filtrar.** Para cada candidato, avaliar:
   - **Afinidade de público.** Combina com o cliente ideal do documento de posicionamento? Segmento de público nomeado?
   - **Saúde do programa.** Publica mensalmente ou mais, episódios recentes nos últimos 90 dias.
   - **Ângulo do apresentador.** O apresentador entrevista operadores / fundadores do nosso setor?
   - **Alcançabilidade.** Existe superfície de contato (e-mail, formulário, Twitter)?
   Manter os 5-8 melhores. Descartar inativos / fora do tema / inalcançáveis.

5. **Redigir pitches por programa.** Para cada programa mantido:
   - **Gancho** (assunto + frase de abertura) - referenciar um episódio recente específico ou ângulo para o apresentador ver que ouvimos.
   - **Ângulo** - ideia de episódio específica que trazemos, ligada à declaração de posicionamento. 2-3 frases.
   - **Prova** - 2-3 tópicos: seu papel, resultado / métrica específica, ideia surpreendente para o ar.
   - **Pedido** - baixo atrito: "15 min para ver se encaixa?" / "Responda se o ângulo fizer sentido e eu mando um one-pager."
   - Voz: alinhar com `config/voice.md`; prefira caloroso e específico.

6. **Escrever** todos os pitches em um único arquivo em `podcast-pitches/{YYYY-MM-DD}.md` atomicamente. Seções por programa. Estrutura do arquivo:
   ```markdown
   # Lote de Pitches de Podcast - {YYYY-MM-DD}

   **Ângulo:** {from config}
   **Público:** {from config}
   **Programas visados:** {count}

   ---

   ## 1. {Show name} - apresentador: {host}
   - Público: {description}
   - Por que esse programa: {one line}
   - Episódio recente referenciado: {title + URL}
   - Contato: {email / form URL / handle}

   **Assunto:** {subject line}

   {full pitch email body}

   ---

   ## 2. {Show name} ...
   ```

7. **Adicionar ao `outputs.json`** - nova entrada, `type: "podcast-pitch"`, `path: "podcast-pitches/{YYYY-MM-DD}.md"`, `status: "draft"`.

8. **Resumir para o usuário** - um parágrafo: "{N} programas contatados: {list of show names}. Melhor combinação: {show} - o apresentador entrevista {ideal customer} e rodou um episódio recente sobre {angle}. Revise, escolha quais enviar, depois envie da sua caixa de entrada, eu nunca envio."

## Resultados

- `podcast-pitches/{YYYY-MM-DD}.md`
- Adiciona ao `outputs.json` com `{ id, type: "podcast-pitch", title, summary, path, status: "draft", createdAt, updatedAt }`.
