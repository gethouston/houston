---
name: reaproveitar-meu-conteudo
title: "Reaproveitar meu conteúdo"
description: "Transformo algo que você já tem em algo novo. Me dê um post de blog, um vídeo do YouTube, um artigo, ou uma publicação de um concorrente, e me diga o formato de destino. Eu reformato para o novo canal na sua voz. Sem plágio, sem deixar genérico."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [linkedin, twitter, youtube, firecrawl]
---


# Reaproveitar Meu Conteúdo

## Quando usar

- Explícito: "transforme este post de blog em posts do LinkedIn", "reaproveite este vídeo do YouTube em um rascunho de blog", "faça uma thread do X a partir deste artigo", "puxe insights compartilháveis de {URL}".
- Implícito: depois que `write-a-post` publica um post de grande sucesso, o fundador pede derivados para redes sociais.
- Muitas combinações de origem × destino, o formato é escolhido dinamicamente a partir do pedido do usuário.

## Conexões que preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar, verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações e paro.

- **Raspagem de web (Firecrawl)** - opcional quando a origem é uma URL. Se não estiver conectado, eu recorro a uma busca HTTP básica, mais rústica, mas funciona em posts de blog e artigos estáticos.
- **YouTube** - puxar a transcrição e os metadados. Obrigatório quando a origem é um vídeo do YouTube, sem alternativa, transcrições precisam da API.
- **Plataformas sociais (LinkedIn, X)** - opcional, só se a origem for um post em uma delas.

Se a origem for um vídeo do YouTube e o YouTube não estiver conectado, eu paro. Para uma origem em URL, eu continuo com a busca HTTP básica e sinalizo se a página for pesada em JS a ponto do resultado ficar raso.

## Informações que preciso

Eu leio primeiro o seu contexto de marketing. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > upload de arquivo > URL > colar) e espero.

- **Seu posicionamento e voz** - Obrigatório. Por que preciso: o conteúdo reaproveitado precisa soar como você, não como o autor original. Se estiver faltando, eu pergunto: "Quer que eu redija seu posicionamento primeiro? É uma skill, leva uns cinco minutos. E conecte sua caixa de enviados para eu captar sua voz."
- **A origem** - Obrigatório. Se estiver faltando, eu pergunto: "O que vou reaproveitar, cole a URL, jogue o link do YouTube, ou cole o texto do artigo."
- **O formato de destino** - Obrigatório. Se estiver faltando, eu pergunto: "Em que você quer que eu transforme isso, cinco posts do LinkedIn, uma thread do X, uma newsletter, um rascunho de blog, ou uma lista de insights compartilháveis?"

## Passos

1. **Ler o documento de posicionamento**: `context/marketing-context.md`. Se estiver faltando, parar e avisar o usuário para rodar `set-up-my-marketing-info` primeiro. Voz e posicionamento são essenciais para conteúdo reaproveitado.
2. **Ler configuração**: `config/site.json` e `config/tooling.json`.
3. **Interpretar origem + destino** a partir do pedido do usuário. A origem pode ser:
   - URL de blog/artigo → buscar via `composio search web` ou ferramenta de raspagem.
   - URL do YouTube → rodar `composio search youtube` para encontrar a ferramenta de transcrição; buscar transcrição + metadados.
   - Artigo ou transcrição colados.
   - URL de blog de concorrente (reaproveitamento legal: insight + crédito).
4. **Absorver a origem.** Puxar o texto completo (ou transcrição). Extrair:
   - Tese / argumento central.
   - 5 a 10 insights distintos.
   - Frases citáveis.
   - Exemplos concretos / números.
5. **Transformar para o formato de destino.** Aplicar o template certo:
   - **Posts do LinkedIn** (padrão: 5 variantes) - gancho + valor + CTA; cada um com menos de 1300 caracteres; uma citação ou estatística de destaque por post.
   - **Thread do X** - 1 tweet de gancho + 6-12 tweets de corpo; cada um ≤ 280 caracteres; CTA de fechamento da thread.
   - **Newsletter** - assunto + preheader + corpo de 300-600 palavras + CTA claro.
   - **Rascunho de blog** - estrutura H1/H2 alinhada com `write-a-post` (mais curto, 800-1200 palavras para YouTube → blog).
   - **Insights compartilháveis** - lista de cards de insight em tópicos, cada um com citação e insight em uma linha.
   Alinhar a voz com o documento de posicionamento; sem deixar genérico.
6. **Escrever** em `repurposed/{source-slug}-to-{target}.md` atomicamente. Front-matter: sourceUrl, sourceType, targetFormat, status.
7. **Adicionar ao `outputs.json`** - `{ id, type: "repurposed", title, summary, path, status: "draft", createdAt, updatedAt }`.
8. **Retornar o conteúdo no chat.** Sempre colar o conteúdo reaproveitado completo na resposta do chat, não só um resumo. O usuário precisa poder ler, copiar e compartilhar o rascunho sem abrir nenhum arquivo. Formato:
   - Uma linha de introdução dizendo o que foi feito (por exemplo, "Aqui está o rascunho de blog." / "Aqui estão os 5 posts do LinkedIn." / "Aqui está a thread do X.").
   - Conteúdo completo, renderizado em markdown, com cada variante claramente separada (`---` entre posts do LinkedIn, tweets numerados em uma thread, corpo completo para um blog).
   - Para saídas com múltiplas variantes (LinkedIn, títulos, copy de anúncio), rotular cada variante (`**Post 1**`, `**Post 2**`, ...).
   - Terminar com uma linha curta de fechamento, uma frase sobre o gancho mais forte ou o ângulo que você usou, e um convite para refinar ("Quer que eu ajuste algum deles, troque o ângulo, ou adicione mais variantes?").
   - Nunca responder só com um caminho de arquivo ou "salvo nos seus rascunhos", o conteúdo sempre vem no próprio chat.

## Nunca inventar

Se a origem não disser, não colocar na peça reaproveitada. Reescrever um post de concorrente (reaproveitamento legal): creditar a fonte explicitamente e transformar bastante o enquadramento, nunca plagiar.

## Resultados

- `repurposed/{source-slug}-to-{target}.md`
- Adiciona ao `outputs.json` com o tipo `repurposed`.
