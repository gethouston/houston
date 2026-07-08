---
name: medir-meu-marketing
title: "Medir meu marketing"
description: "Configuro a medição que você precisa para você parar de adivinhar. Escolha o que você precisa: um plano de rastreamento de eventos que você pode entregar a um desenvolvedor, uma especificação completa de teste A/B com hipótese e tamanho de amostra, ou um resumo semanal do LinkedIn mostrando como suas publicações se saíram e com quem vale a pena interagir."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [linkedin, reddit]
---


# Medir meu marketing

Uma skill para todo trabalho de medição. O parâmetro `scope` escolhe o formato da saída: uma especificação de rastreamento de eventos pronta para um desenvolvedor, um documento rigoroso de teste A/B, ou um resumo semanal de desempenho no LinkedIn. Tudo ancorado no seu posicionamento para você medir o que importa para o seu cliente ideal, não números de vaidade.

## Parâmetro: `scope`

- `tracking-plan`  -  plano de rastreamento de eventos (nome do evento, gatilho, propriedades, responsável por etapa) mais uma matriz de UTM para que pago / social / e-mail sejam comparáveis no GA4 / no seu analytics. Saída: `tracking-plans/{slug}.md`.
- `ab-test`  -  especificação completa de teste cobrindo hipótese (PICOT), controle versus variante, métricas primária + secundárias, estimativa de tamanho de amostra com MDE + poder estatístico, duração e critérios de go/no-go. Saída: `ab-tests/{slug}.md`.
- `linkedin-digest`  -  resumo semanal das estatísticas das suas próprias publicações (alcance, engajamento, novos seguidores) mais publicações notáveis da sua rede com as quais vale a pena interagir. Saída: `linkedin-digests/{YYYY-MM-DD}.md`.

O usuário nomeia o escopo em linguagem simples ("especifique o rastreamento de eventos do cadastro", "teste A/B para a página de preços", "resumo do LinkedIn", "como foram minhas publicações") -> inferir. Ambíguo -> fazer UMA pergunta nomeando as três opções.

## Quando usar

**tracking-plan:**
- "Especifique o rastreamento de eventos de cadastro -> ativação"
- "Plano de UTM para as campanhas do Q2"
- "Plano de rastreamento para a nova página de preços"
- Chamado por `plan-a-campaign` quando a campanha precisa de eventos ou UTMs que ainda não existem.

**ab-test:**
- "Teste A/B para o título da página de preços"
- "Desenhe um experimento para {proposed change}"
- "Hipótese para trocar {X} por {Y}"
- Costuma vir depois de `audit-a-surface` (surface=landing-page) quando as correções sinalizadas não são óbvias -> desenhar o teste.

**linkedin-digest:**
- "Resumo do LinkedIn" / "como foram minhas publicações esta semana" / "apanhado semanal do LinkedIn" / "o que a minha rede publicou".
- Semanal  -  rotina de sexta-feira / domingo à noite.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar, eu verifico se as categorias abaixo estão conectadas. Faltando -> eu nomeio a categoria, peço para você conectá-la na aba de Integrações e paro.

- **Analytics (PostHog, GA4, Mixpanel)**  -  necessário para `tracking-plan` (convenções do destino) e `ab-test` (ler a taxa de conversão base e o tráfego atual para a estimativa de tamanho de amostra não ser um chute). Para `tracking-plan`: se "nenhum", eu especifico um plano e recomendo conectar o PostHog (plano gratuito) antes de implementar. Para `ab-test`: obrigatório se você quer uma estimativa real, opcional se você colar a base.
- **LinkedIn**  -  Obrigatório para `linkedin-digest` (puxar as estatísticas das suas publicações e as publicações da sua rede). Não existe alternativa de colar para dados de engajamento do LinkedIn. Não é necessário para os outros escopos.

Se nenhuma ferramenta de analytics estiver conectada para `tracking-plan`, eu sigo em frente com a especificação e deixo isso claro, mas recomendo conectar o PostHog ou o GA4 antes da implementação.

Se nenhuma ferramenta de analytics estiver conectada para `ab-test`, eu paro e peço para você conectar uma, ou colar sua taxa de conversão base mais o tráfego semanal.

Se o LinkedIn não estiver conectado para `linkedin-digest`, eu paro e peço para você vinculá-lo na aba de Integrações.

## Informações que eu preciso

Eu leio seu contexto de marketing primeiro. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Seu posicionamento**  -  Obrigatório (todos os escopos). Por que eu preciso: para `tracking-plan` ele me diz o que conta como evento significativo versus ruído; para `ab-test` a hipótese tem que se conectar a uma dor ou objeção real do cliente ideal; para `linkedin-digest` eu julgo as publicações contra a sua categoria e o seu cliente ideal. Se faltar, eu pergunto: "Quer que eu rascunhe seu posicionamento primeiro? É uma skill só, leva uns cinco minutos."
- **Seu evento de conversão principal**  -  Obrigatório para `tracking-plan` e `ab-test`. Por que eu preciso: todo fluxo termina em um evento de sucesso mensurável (`tracking-plan`); essa é a métrica primária do teste (`ab-test`). Se faltar, eu pergunto: "Qual é o único evento que significa que este fluxo funcionou, cadastro, ativação, compra, demo agendada?"
- **O fluxo a especificar**  -  Obrigatório para `tracking-plan`. Por que eu preciso: planos de rastreamento são escopados a um fluxo por vez. Se faltar, eu pergunto: "Qual fluxo vamos rastrear, cadastro, ativação, preços até checkout, atribuição de campanha, ou outra coisa?"
- **Seus canais de anúncio**  -  Opcional para `tracking-plan`, só se você quiser uma matriz de UTM que os nomeie. Se faltar, eu pergunto: "Para quais canais você quer modelos de UTM, Google, Meta, LinkedIn, newsletter, social orgânico? Se você não tiver uma lista, eu sigo com os padrões comuns."
- **A variável a testar**  -  Obrigatório para `ab-test`. Por que eu preciso: uma variável por teste, nada de gambiarras multivariadas. Se faltar, eu pergunto: "Qual elemento único vamos testar, título, imagem principal, copy do CTA, layout de preços, selos de confiança, ou outra coisa?"
- **Taxa de conversão base**  -  Obrigatório para `ab-test`. Por que eu preciso: alimenta o cálculo do tamanho de amostra. Se faltar, eu pergunto: "Qual é a taxa de conversão atual desta página ou fluxo? Se você não tiver um número, eu sigo com premissas e as sinalizo."
- **Tráfego semanal**  -  Obrigatório para `ab-test`. Por que eu preciso: transforma o tamanho de amostra em "dias de tráfego". Se faltar, eu pergunto: "Mais ou menos quantos visitantes passam por esta superfície por semana?"
- **Seus tópicos**  -  Obrigatório para `linkedin-digest`. Por que eu preciso: filtra quais publicações da rede valem interação. Se faltar, eu pergunto: "Quais tópicos você quer que eu acompanhe, três a cinco temas que realmente te importam?"

## Passos

### Passos compartilhados (todos os escopos)

1. **Ler o documento de posicionamento** em `context/marketing-context.md`. Se faltar, dizer ao usuário para rodar `set-up-my-marketing-info` primeiro e parar.
2. **Ler a configuração relevante** para o escopo  -  detalhes em cada ramo abaixo.

### Ramificar por `scope`:

#### `tracking-plan`

3. **Ler a configuração:** `config/analytics.json`, `config/conversion.json`, `config/tracking-prefs.json` se existirem. Se o stack de analytics for "nenhum", sinalizar que o rastreamento pode ser especificado mas não implementado  -  recomendar conectar o PostHog (plano gratuito) ou o GA4 via Composio como mínimo.
4. **Esclarecer o fluxo.** O usuário nomeia o fluxo  -  "cadastro", "ativação", "página de preços -> checkout", "atribuição de campanha". Mapear em etapas discretas (3-7 é o típico). Fazer UMA pergunta se o limite do fluxo não estiver claro (evento de início? evento de sucesso?).
5. **Especificação de rastreamento de eventos**  -  uma linha por evento:
   - `eventName` (snake_case, começando com verbo: `signup_started`, `signup_completed`, `checkout_viewed`, `checkout_completed`).
   - `trigger` (ação de UI / evento de servidor / correspondência de URL).
   - `properties`  -  3-6 por evento, no mínimo `user_id`, `anonymous_id`, `timestamp`, e dimensões específicas do fluxo (plano, canal, referrer).
   - `destination`  -  qual ferramenta (GA4 / PostHog / Mixpanel / roteador Segment / servidor).
   - `owner`  -  quem entrega (fundador solo -> "você"; senão, o papel).
   - `status`  -  `proposed` / `live` / `deprecated`.
6. **Matriz de UTM**  -  regras de nomenclatura para toda tag de campanha ficar consistente:
   - `utm_source`  -  plataforma (`google` / `meta` / `linkedin` / `reddit` / `newsletter` / `x`).
   - `utm_medium`  -  tipo de canal (`cpc` / `paid-social` / `email` / `organic-social` / `referral`).
   - `utm_campaign`  -  kebab-case `{yyyy-qX}-{theme}` (ex.: `2026-q2-founder-launch`).
   - `utm_content`  -  variante / slot de criativo (kebab-case).
   - `utm_term`  -  palavra-chave (só busca).
   Incluir uma linha de exemplo preenchida por canal ativo de `config/channels.json`.
7. **Checklist de QA**  -  5-10 itens: evento dispara no gatilho esperado, deduplicação tratada, sem PII nas propriedades, sinais de consentimento respeitados, parâmetros UTM preservados através de redirecionamentos.
8. **Escrever** de forma atômica em `tracking-plans/{slug}.md` (`*.tmp` -> renomear). Salvar as convenções de nomenclatura em `config/tracking-prefs.json` para execuções futuras reutilizarem.
9. **Adicionar ao `outputs.json`**  -  `{ id, type: "tracking-plan", title, summary, path, status: "ready", createdAt, updatedAt }`.
10. **Resumir para o usuário**  -  número de eventos especificados, modelo de UTM para copiar, caminho do plano.

#### `ab-test`

3. **Ler a configuração:** `config/conversion.json` (evento principal + taxa base se definida), `config/analytics.json` (ferramenta que roda o teste).
4. **Esclarecer a variável.** Se o usuário nomeou a mudança de forma vaga ("testar a página de preços"), fazer uma pergunta: "Qual elemento  -  título, imagem principal, copy do CTA, layout da tabela de preços, selos de confiança, ou outra coisa?" Escolher uma variável. Nada de testes com várias variáveis na v1.
5. **Hipótese PICOT:**
   - **P**  -  População (quem vê).
   - **I**  -  Intervenção (a mudança da variante).
   - **C**  -  Comparação (controle = página atual).
   - **O**  -  Resultado (métrica primária).
   - **T**  -  Tempo (duração do teste).
   Escrever como uma frase: "Entre {P}, mudar {I} vs. {C} vai melhorar {O} em pelo menos {MDE}% dentro de {T}."
6. **Métricas:**
   - **Primária**  -  o evento de conversão de `config/conversion.json`.
   - **Secundárias**  -  2-3 salvaguardas (taxa de rejeição, tempo na página, ativação subsequente).
   - **Não-métricas**  -  o que NÃO estamos medindo (evita pesca de resultados depois do fato).
7. **Estimativa de tamanho de amostra.** Dada a taxa de conversão base (da configuração ou colada pelo usuário), o MDE alvo (perguntar ao usuário; padrão 10% relativo), alfa 0,05, poder 0,80  -  calcular a amostra necessária por variante usando a fórmula padrão do teste z de duas proporções. Mostrar os números. Traduzir em "dias de tráfego" usando o volume atual. Se a base ou o volume forem desconhecidos, declarar as premissas e marcar o número como estimativa.
8. **Duração + condições de parada.**
   - Duração mínima (um ciclo de negócio completo, ex.: 7 ou 14 dias mesmo que a amostra chegue antes  -  evita viés de dia da semana).
   - Política de espiada (nada de espiar e parar; ferramentas bayesianas são exceção).
   - Condições de parada imediata (violação de salvaguarda negativa > X%).
9. **Critérios de go / no-go.** Qual resultado publica a variante, qual resultado a mata, qual resultado leva a um teste de acompanhamento.
10. **Notas de implementação.** Ferramenta que executa o teste, IDs de eventos que o alimentam (link para `tracking-plans/` se existir), quem faz o QA antes do lançamento.
11. **Escrever** de forma atômica em `ab-tests/{slug}.md` (`*.tmp` -> renomear).
12. **Adicionar ao `outputs.json`**  -  `{ id, type: "ab-test", title, summary, path, status: "draft", createdAt, updatedAt }`.
13. **Resumir para o usuário**  -  hipótese em uma frase, amostra necessária, duração, caminho do documento.

#### `linkedin-digest`

3. **Ler `config/platforms.json`, `config/topics.json`.** Confirmar que o LinkedIn está em `active` e `connectedViaComposio`. Se não estiver conectado, dizer ao usuário para vincular pela aba de Integrações e parar  -  a skill precisa da API.
4. **Puxar as estatísticas das suas publicações.** Rodar `composio search linkedin` para encontrar a ferramenta de estatísticas de publicações / listagem das próprias publicações. Executar. Puxar as publicações do usuário dos últimos 7 dias com:
   - impressões / alcance
   - reações / comentários / compartilhamentos / republicações
   - novos seguidores ganhos naquele dia, se disponível
   Métrica faltando -> marcar TBD, anotar a causa provável (ex.: "a API do LinkedIn não expõe o delta de novos seguidores por publicação").
5. **Puxar as publicações da rede.** Mesma categoria LinkedIn, encontrar a ferramenta de leitura de feed. Puxar os últimos 7 dias das conexões do usuário. Filtrar por alto engajamento (decil superior por reações) OU relevância temática frente a `config/topics.json`. Manter as 5-10 melhores.
6. **Montar o apanhado.** Produzir:
   - **Sua semana em um relance**  -  contagem de publicações, impressões totais, engajamento total, delta de seguidores, melhor publicação, pior publicação.
   - **Padrões**  -  leitura de uma linha sobre o que funcionou (tamanho do gancho, tópico, horário se for detectável). Citar publicações específicas.
   - **Destaques da rede**  -  5-10 publicações de conexões que merecem reação ou resposta. Cada uma: relevância em uma linha + ação sugerida (responder / reagir / ignorar).
7. **Escrever** em `linkedin-digests/{YYYY-MM-DD}.md` de forma atômica. Estrutura:
   ```markdown
   # Resumo do LinkedIn  -  semana encerrada em {YYYY-MM-DD}

   ## Sua semana
   - Publicações: {N}
   - Impressões: {total} ({delta vs semana anterior})
   - Engajamento: {reactions} reações . {comments} comentários . {shares} compartilhamentos
   - Novos seguidores: {count ou TBD}
   - Melhor publicação: [{título ou gancho}]({url})  -  {métrica}
   - Pior publicação: [{título ou gancho}]({url})  -  {métrica}

   ## O que funcionou
   - {padrão em uma linha, com citação}
   - {padrão em uma linha, com citação}

   ## Destaques da rede
   1. **{Autor}**  -  {resumo da publicação em uma linha} ({URL})
      Ação sugerida: {responder / reagir / ignorar} . {porquê}
   2. ...

   ---

   ## Notas
   - Atualidade dos dados: coletados em {ISO timestamp}
   - TBDs, se houver: {lista}
   ```
8. **Adicionar ao `outputs.json`**  -  nova entrada, `type: "linkedin-digest"`, `path: "linkedin-digests/{YYYY-MM-DD}.md"`, `status: "draft"`.
9. **Resumir para o usuário**  -  um parágrafo: "Semana encerrada em {date}: {N} publicações, {impressions} impressões, a melhor foi {title} ({metric}). {count} destaques da rede sinalizados. Resumo completo em {path}."

## O que eu nunca faço

- Publicar tags ou eventos em produção  -  o fundador (ou dev) entrega a implementação. Todo plano de rastreamento é uma especificação que você repassa.
- Afirmar melhora antes de um teste rodar. Toda hipótese é "efeito direcional esperado + porquê"  -  nunca "isto vai converter melhor".
- Fabricar taxas de conversão base, números de tráfego ou métricas do LinkedIn. Ferramenta não retornou dados -> marcar TBD.
- Rodar testes com várias variáveis na v1  -  uma variável por teste.
- Enviar, postar ou publicar qualquer coisa  -  você é quem entrega cada artefato.

## Saídas

- `tracking-plans/{slug}.md` (scope=tracking-plan) + escreve/atualiza `config/tracking-prefs.json`
- `ab-tests/{slug}.md` (scope=ab-test)
- `linkedin-digests/{YYYY-MM-DD}.md` (scope=linkedin-digest)
- Todos adicionam ao `outputs.json` com o `type` correspondente: `"tracking-plan"` | `"ab-test"` | `"linkedin-digest"`.
