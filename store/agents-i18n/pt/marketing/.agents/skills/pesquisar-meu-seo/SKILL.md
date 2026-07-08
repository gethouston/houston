---
name: pesquisar-meu-seo
title: "Pesquisar meu SEO"
description: "Construo a base de SEO que você precisa para rankear. Escolha o foco: pesquisa de palavras-chave que agrupa termos por intenção e dificuldade e define os pilares que vale a pena dominar, ou um plano de backlinks que encontra sites alvo e redige um pitch personalizado para cada um. Os dois baseados no seu posicionamento para você buscar o tráfego certo."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [semrush, ahrefs, firecrawl]
---


# Pesquisar Meu SEO

Uma skill para as duas tarefas fundamentais de pesquisa de SEO. O parâmetro `focus` escolhe se você está construindo clusters de palavras-chave ou um plano de prospecção de backlinks. Ambos leem seu posicionamento primeiro, para que toda recomendação se conecte de volta ao seu cliente ideal e categoria.

## Parâmetro: `focus`

- `keywords` - agrupar termos por intenção e dificuldade via Semrush / Ahrefs, sinalizar os 3 pilares que valem a pena dominar, redigir briefings de cluster. O `keyword-map.md` vivo recebe cada novo cluster. Saída: `keyword-clusters/{cluster-slug}.md` + atualiza `keyword-map.md`.
- `backlinks` - identificar de 15 a 30 sites alvo via SERP + ferramenta de backlink, classificar por esforço, redigir um e-mail de pitch personalizado para cada um. Saída: `backlink-plans/{YYYY-MM-DD}.md`.

O usuário nomeia o foco em português simples ("encontrar palavras-chave para {topic}", "construir um mapa de palavras-chave", "quem devemos abordar para links", "plano de link-building") -> eu infiro. Ambíguo -> faço UMA pergunta nomeando as duas opções.

## Quando usar

**keywords:**
- Explícito: "encontrar palavras-chave para {topic}", "construir um mapa de palavras-chave", "para o que devemos rankear", "pesquisa de palavras-chave sobre {topic}", "me dê um cluster para {seed term}".
- Implícito: chamado por `write-a-post` quando a palavra-chave alvo estiver faltando, ou por `check-my-marketing` (subject=content-gap) para dimensionar oportunidades de lacunas.
- Roda várias vezes, um cluster por chamada. O `keyword-map.md` vivo recebe cada novo cluster.

**backlinks:**
- Explícito: "encontrar backlinks", "quem devemos abordar para links", "plano de link-building", "alvos de backlink para {topic}", "prospecção de links".
- Implícito: dentro de um plano de lançamento quando amplificação externa é necessária.
- Cadência semanal ou por campanha.

## Conexões que preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar, verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações e paro.

- **SEO (Semrush ou Ahrefs)** - Obrigatório (ambos os focos). Para `keywords`: puxa volumes, dificuldade e intenção de cada termo. Para `backlinks`: encontra os sites alvo que valem a pena abordar e avalia sua autoridade.
- **Raspagem de web (Firecrawl)** - Obrigatório para `backlinks` (lê os posts recentes do alvo para o pitch referenciar trabalho real, não elogio genérico). Não necessário para `keywords`.
- **Caixa de entrada (Gmail, Outlook)** - Opcional para `backlinks` (capta sua voz para os e-mails de pitch; os rascunhos ficam sem graça sem isso). Não necessário para `keywords`.

Se nenhuma ferramenta de SEO estiver conectada, eu paro e peço para você conectar o Semrush ou o Ahrefs (ou colar uma lista inicial de termos para `keywords`).

Se nem o Ahrefs nem o Semrush estiverem conectados para `backlinks`, eu paro e peço para você conectar um dos dois.

## Informações que preciso

Eu leio primeiro o seu contexto de marketing. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > upload de arquivo > URL > colar) e espero.

- **Seu posicionamento** - Obrigatório (ambos os focos). Por que preciso: o cliente ideal e o enquadramento de categoria decidem quais palavras-chave valem a pena buscar (`keywords`) e quais sites são relevantes versus ruído (`backlinks`). Se estiver faltando, eu pergunto: "Quer que eu redija seu posicionamento primeiro? É uma skill, leva uns cinco minutos."
- **O domínio do seu site** - Obrigatório (ambos os focos). Por que preciso: para `keywords` eu verifico para o que você já ranqueia, para não propor palavras-chave que você já domina; para `backlinks` eu verifico quem já linka para você, para não abordar sites que já cobrem você. Se estiver faltando, eu pergunto: "Qual é o seu site? Cole a URL."
- **O termo inicial** - Obrigatório para `keywords`. Por que preciso: um cluster por execução, eu não quero adivinhar. Se estiver faltando, eu pergunto: "Qual é o termo ou tema inicial para o qual você quer um cluster de palavras-chave?"
- **Sua voz** - Obrigatório para os e-mails de pitch de `backlinks`. Se estiver faltando, eu pergunto: "Conecte sua caixa de enviados para eu captar sua voz, ou cole dois ou três e-mails que você já enviou."
- **Tema ou ângulo para o pitch** - Opcional para `backlinks`. Se estiver faltando, eu pergunto: "Qual ângulo você quer que eu use no pitch? Se você não tiver preferência, eu sigo com seu posicionamento principal."

## Passos

### Passos compartilhados (ambos os focos)

1. **Ler o documento de posicionamento**: `context/marketing-context.md`. Se estiver faltando, parar. Avisar o usuário para rodar `set-up-my-marketing-info` primeiro.
2. **Ler configuração**: `config/site.json`, `config/tooling.json`.
3. **Descobrir ferramenta**: `composio search keyword` (alternativa `composio search seo`) para `keywords`; `composio search backlink` (alternativa `composio search seo`, último recurso `composio search web`) para `backlinks`. Escolher o primeiro slug conectado correspondente.

### Ramificar pelo `focus`:

#### `keywords`

4. **Verificar se a ferramenta de SEO está conectada.** Nenhuma ferramenta de palavras-chave de SEO conectada -> fazer UMA pergunta: "Conecte uma ferramenta de palavras-chave na aba Integrações (Semrush / Ahrefs / etc) ou cole uma lista inicial de termos que você acha que importam, qual das duas?"
5. **Construir o cluster** para o tema pedido:
   - Expandir o termo inicial em 15-40 termos relacionados (cabeça + cauda longa).
   - Puxar por termo: volume de busca, dificuldade da palavra-chave, intenção de SERP (informacional / comercial / navegacional / transacional).
   - Agrupar em sub-clusters por intenção ou subtema.
   - Pontuar a prioridade de cada termo: `(volume / dificuldade) x encaixe-de-intenção x encaixe-com-cliente-ideal`. O encaixe com cliente ideal referencia o documento de posicionamento.
6. **Escrever o detalhe por cluster** em `keyword-clusters/{cluster-slug}.md` atomicamente. Estrutura: resumo do cluster, justificativa de cliente ideal / posicionamento, tabela de sub-clusters (termo / volume / dificuldade / intenção / prioridade), primeiros 3 posts recomendados para redigir.
7. **Adicionar ao `keyword-map.md`** (documento vivo na raiz do agente). Arquivo ausente -> criar com um preâmbulo curto. Adicionar nova seção para esse cluster com link para o arquivo de detalhe por cluster + os 5 termos de maior prioridade. Escrita atômica: ler -> adicionar em memória -> escrever `*.tmp` -> renomear.
8. **Adicionar ao `outputs.json`** - `{ id, type: "keyword-map", title, summary, path: "keyword-clusters/{slug}.md", status: "draft", createdAt, updatedAt }`.
9. **Resumir para o usuário** - nomear os 3 termos de maior prioridade, sinalizar o melhor primeiro post para redigir, linkar tanto o detalhe do cluster quanto o `keyword-map.md` atualizado.

#### `backlinks`

4. **Ler `config/voice.md`** se existir (para o tom do e-mail de pitch). Se a voz estiver faltando, fazer UMA pergunta: "Conecte sua caixa de enviados via Composio para eu captar sua voz, ou cole 2-3 e-mails que você já enviou, qual das duas?"
5. **Construir a lista de alvos** (15-30 prospects). Cada alvo:
   - Domínio + página/autor específico para abordar.
   - Por que eles: relevância temática, Domain Authority (ou métrica equivalente), comportamento passado de linkar produtos parecidos, sobreposição com cliente ideal.
   - Tipo de oportunidade de link: guest post / página de recursos / substituição de link quebrado / adição em lista "melhores X" / round-up de especialistas / podcast.
6. **Classificar por camadas**: Camada 1 (alto valor, alto esforço), Camada 2 (médio / médio), Camada 3 (vitórias rápidas). Mirar em aproximadamente 5 / 10 / 10.
7. **Redigir e-mails de pitch por alvo.** Cada alvo produz um pitch conciso (menos de 150 palavras): elogio específico ligado a um post real deles, troca de valor, CTA suave. Alinhar a voz com `config/voice.md` (se disponível) e o posicionamento do documento compartilhado.
8. **Escrever** em `backlink-plans/{YYYY-MM-DD}.md` atomicamente. Estrutura: Resumo executivo -> alvos da Camada 1 (tabela + pitch por alvo) -> Camada 2 -> Camada 3 -> recomendação de cadência de prospecção.
9. **Adicionar ao `outputs.json`** - `{ id, type: "backlink-plan", title, summary, path, status: "draft", createdAt, updatedAt }`.
10. **Resumir para o usuário** - contagem por camada, os 3 alvos mais promissores, e o caminho. Lembrar o usuário: aprovação necessária antes de qualquer pitch ser realmente enviado (a skill redige, não envia).

## O que eu nunca faço

- Estimar volume/dificuldade sem resultado de ferramenta. Se a ferramenta retornar dados parciais, marcar as lacunas como TBD.
- Fabricar intenção de SERP, ler o SERP real quando a ferramenta puder buscar.
- Fabricar o trabalho passado do destinatário ou os interesses editoriais da publicação. Todo elogio ligado a uma URL real.
- Marcar métricas de domínio que a ferramenta não retornou como TBD, nunca inventar.
- Enviar, postar ou publicar qualquer pitch, o fundador entrega. Todo e-mail de prospecção é um rascunho que você aprova.

## Resultados

- `keyword-clusters/{cluster-slug}.md` (focus=keywords, detalhe por cluster)
- `keyword-map.md` (focus=keywords, documento vivo na raiz do agente, atualizado a cada execução)
- `backlink-plans/{YYYY-MM-DD}.md` (focus=backlinks)
- Todos adicionam ao `outputs.json` com o `type` correspondente: `"keyword-map"` | `"backlink-plan"`.
