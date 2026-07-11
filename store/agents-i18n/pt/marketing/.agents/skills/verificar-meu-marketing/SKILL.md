---
name: verificar-meu-marketing
title: "Verificar meu marketing"
description: "Te dou um diagnóstico real de como seu marketing está indo. Escolha o que você precisa: uma leitura de funil que aponta o maior vazamento com experimentos para rodar, uma análise de lacunas de conteúdo frente a um concorrente, ou um resumo semanal de tudo que entreguei e o que falta. Números e próximos passos, não um painel."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [linkedin, firecrawl, semrush]
---


# Verificar meu marketing

Uma skill, três assuntos. O parâmetro `subject` escolhe a lente. "Nunca inventar números" vale para todos.

## Parâmetro: `subject`

- `funnel`  -  conversão etapa a etapa do PostHog / GA4 / Mixpanel (ou colado). Maior queda + 2-3 experimentos classificados por melhora esperada x esforço.
- `content-gap`  -  rastrear o concorrente via Firecrawl / Semrush, comparar com o nosso conteúdo, classificar as lacunas por volume x aderência / dificuldade, briefing de primeiro rascunho por lacuna principal.
- `marketing-health`  -  resumo semanal do que ESTE agente entregou (blog / campanhas / e-mails / social / reescritas de página) agrupando o `outputs.json` por tipo. Sinalizar lacunas ("nenhum drip em 3 semanas"), recomendar próximos passos por domínio.

O usuário nomeia o assunto em linguagem simples ("revisão semanal do funil", "onde estamos vazando", "o que está faltando frente à Ramp", "revisão de marketing de segunda-feira") -> inferir. Ambíguo -> fazer UMA pergunta nomeando as 3 opções.

## Quando usar

- Explícito: "revisão semanal do funil", "analise o funil de cadastro", "lacunas de conteúdo frente a {competitor}", "onde podemos ranquear acima de {X}", "revisão de marketing de segunda-feira", "leitura semanal".
- Implícito: tipicamente agendado (semanal / segunda-feira) por rotina.
- Cadência: `funnel` semanal, `content-gap` no máximo mensal por concorrente, `marketing-health` semanal.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar, eu verifico se as categorias abaixo estão conectadas. Faltando -> eu nomeio a categoria, peço para você conectá-la na aba de Integrações e paro.

- **Analytics (PostHog, GA4 ou Mixpanel)**  -  fonte das contagens do funil etapa a etapa. Obrigatório para `funnel`  -  sem alternativa útil, os dados vivem na sua ferramenta de analytics.
- **Web scrape (Firecrawl)**  -  opcional para `content-gap`. Se não estiver conectado, recorro a uma busca HTTP básica nas páginas do concorrente, mais grosseira, mas funcional em sites estáticos.
- **SEO (Semrush ou Ahrefs)**  -  dimensionar volumes de palavras-chave e lacunas de ranqueamento. Obrigatório para `content-gap`  -  sem alternativa, esses dados são proprietários.

Se analytics é obrigatório para `funnel` e não está conectado, eu paro. Para `content-gap`, se os dados de SEO estão faltando, eu paro também. A categoria de scrape é a única em que eu sigo em frente com uma alternativa.

## Informações que eu preciso

Eu leio seu contexto de marketing primeiro. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Seu posicionamento**  -  Obrigatório para `content-gap` e `marketing-health`, útil para `funnel`. Por que eu preciso: diferencia ameaças de ruído e enquadra a leitura. Se faltar, eu pergunto: "Quer que eu rascunhe seu posicionamento primeiro? É uma skill só, leva uns cinco minutos."
- **Sua ferramenta de analytics e conversão principal**  -  Obrigatório para `funnel`. Por que eu preciso: eu não vou inventar números de funil. Se faltar, eu pergunto: "Conecte o PostHog, GA4 ou Mixpanel na aba de Integrações para eu puxar seu funil, ou cole as contagens etapa a etapa dos últimos sete dias."
- **O domínio do seu site**  -  Obrigatório para `content-gap` (o site que eu comparo com o concorrente). Se faltar, eu pergunto: "Qual é o seu site? Cole a URL."

## Passos

1. **Ler o ledger + posicionamento.** Coletar os campos obrigatórios faltantes (UMA pergunta cada, melhor modalidade primeiro).
2. **Ramificar pelo assunto.**
   - `funnel`: buscar os números nesta ordem de prioridade:
     - a) Analytics conectado via Composio  -  rodar `composio search` para o provedor em `domains.paid.analytics`, executar a ferramenta de funil / consulta pelo slug, puxar as contagens por etapa dos últimos 7 dias + os 7 dias anteriores.
     - b) Senão, pedir para o usuário colar `etapa | contagem | período`.
     - c) Nenhum dos dois -> parar. Nada de números inventados.
     Definir as etapas: usar as etapas capturadas no ledger se existirem; senão, propor 4-6 com base na conversão principal (ex.: cadastro: `visit -> signup_started -> signup_completed -> activation_event -> retained_day_7`), confirmar na primeira execução, escrever no ledger. Calcular taxas por etapa + variações semana a semana + quedas em números absolutos. Nomear o **maior vazamento** (maior queda absoluta E menor conversão frente a benchmarks razoáveis  -  SaaS B2B: visita->cadastro 2-5%, cadastro->ativação 30-60%, ativação->retenção no dia 7 40-70%). Recomendar 2-3 experimentos classificados por (impacto x esforço): etapa alvo + hipótese (entregar à skill dedicada de especificação de teste A/B) + esforço (esta semana / este mês / maior) + melhora direcional esperada ligada a um mecanismo real (nada de números mágicos).
   - `content-gap`: resolver o(s) domínio(s) do(s) concorrente(s)  -  nomeados pelo usuário ou os 1-3 principais do posicionamento. Rodar `composio search web-scrape` / `composio search seo` para rastrear o concorrente: palavras-chave ranqueadas, principais páginas por tráfego estimado, clusters de tópicos que ele domina. Rastrear o NOSSO conteúdo via CMS conectado ou pela lista de posts de `domains.seo.domain`. Por tópico / palavra-chave do concorrente, registrar: nós cobrimos (sim / parcial / não), volume de busca (da ferramenta de palavras-chave), dificuldade estimada (relativa), aderência ao posicionamento (sim / neutro / fora da marca). Classificar por `(volume x fit) / difficulty`. Trazer as 10 principais com a próxima ação recomendada (post novo -> entregar a `write-a-post` channel=blog / atualizar um existente / pular + porquê).
   - `marketing-health`: ler o `outputs.json` DESTE agente (arquivo único  -  um agente agora, não cinco). Filtrar para a janela de revisão (padrão: últimos 7 dias por `createdAt` / `updatedAt`; respeitar o "últimas 2 semanas", "desde o lançamento" do usuário). Agrupar por `type`  -  blog-post, linkedin-post, x-thread, newsletter, community-reply, page-copy, audit, campaign, competitor-brief, analysis. Por grupo, calcular: contagem, entregas notáveis (top 3 por recência com título + caminho + status), rascunhos ainda abertos (status = "draft") parados há >7 dias, lacunas  -  o que está FALTANDO que o stack de um fundador solo espera (nenhum blog esta semana, nenhum briefing de campanha esta semana, nenhuma newsletter, nenhuma sequência de boas-vindas rascunhada, frequência nas redes abaixo do plano). Procurar padrões transversais: deriva de lançamento (campanha de lançamento aberta com peças dependentes não entregues), sinais de concorrentes sem ação tomada, deriva de posicionamento em análises recentes.
3. **Rascunhar a análise** (markdown, ~400-700 palavras para health / funnel, mais longa para content-gap):
   - `funnel` -> conversão geral + diagrama do funil (texto simples) + maior vazamento com número + experimentos classificados + status (ready, não draft  -  é um resumo factual).
   - `content-gap` -> Resumo executivo + Tabela das 10 principais oportunidades + detalhe tópico a tópico + lista de descartes com as razões.
   - `marketing-health` -> Janela + TL;DR (3-5 bullets) + O que foi entregue por domínio + Lacunas (classificadas por severidade) + Questões transversais + 3-5 próximos passos recomendados marcados com a skill do agente que os executa (ex.: `[write-a-post:newsletter]`, `[plan-a-campaign:lifecycle-drip]`, `[audit-a-surface:landing-page]`) + O que virar para ready (rascunhos parados aguardando aprovação). Status `ready`.
4. **Escrever** de forma atômica em `analyses/{subject}-{YYYY-MM-DD}.md` (`*.tmp` -> renomear). Content-gap usa `analyses/content-gap-{competitor-slug}-{YYYY-MM-DD}.md`.
5. **Adicionar ao `outputs.json`**  -  ler-mesclar-escrever de forma atômica: `{ id (uuid v4), type: "analysis", title, summary, path, status: "ready", createdAt, updatedAt }`.
6. **Resumir para o usuário.** Um parágrafo:
   - `funnel` -> conversão geral + maior vazamento com número + um experimento para esta semana + caminho.
   - `content-gap` -> as 3 principais oportunidades, cada uma com um título de post recomendado em uma linha + caminho.
   - `marketing-health` -> "{N} entregas esta semana em {domains}. Maior lacuna: {gap}. Maior próximo passo: {move}. Revisão completa: {path}."

## O que eu nunca faço

- Inventar números de funil, estimativas de tráfego de concorrentes ou estatísticas de engajamento. Dados inalcançáveis -> dizer isso e parar (funnel) ou marcar TBD (content-gap).
- Inflar lacunas onde a cobertura está boa.
- Prometer percentual de melhora  -  experimentos vêm com MDE + ressalvas de mecanismo.
- Fixar nomes de ferramentas. Descoberta via Composio em tempo de execução, sempre.

## Saídas

- `analyses/{subject}-{YYYY-MM-DD}.md`
- Adiciona entrada ao `outputs.json` com tipo `analysis`.
