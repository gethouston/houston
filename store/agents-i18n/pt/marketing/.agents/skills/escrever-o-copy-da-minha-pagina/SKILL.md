---
name: escrever-o-copy-da-minha-pagina
title: "Escrever o copy da minha página"
description: "Reescrevo o copy de qualquer página ou superfície dentro do produto. Escolha a superfície: página inicial, preços, sobre, uma landing page, seu fluxo de cadastro, onboarding dentro do app, paywall de upgrade, ou um popup. Você recebe o atual versus o proposto com o raciocínio por trás de cada mudança. Apenas rascunhos."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [reddit, firecrawl]
---


# Escrever o copy da minha página

Uma skill, toda superfície de copy no site + no produto. O parâmetro `surface` escolhe o formato. Posicionamento, voz, nada de citações inventadas, nada de % de melhoria prometida, compartilhados entre todas.

## Parâmetro: `surface`

- `homepage` | `pricing` | `about` | `landing`  -  reescrita completa da página: seções, títulos, corpos de texto, CTAs, posicionamento da prova social.
- `signup-flow`  -  copy da página pré-cadastro + campo de e-mail + regras de senha + tela de verificação + primeira tela pós-cadastro. Veredictos por campo (manter / fundir / adiar / eliminar).
- `onboarding`  -  boas-vindas dentro do produto, estados vazios, tooltips, lembretes, checklist, confirmação do momento aha.
- `paywall`  -  modal de upgrade / expiração de teste / bloqueio de funcionalidade: auditoria de timing primeiro, depois título + pilha de valor + comparação de planos + ancoragem de preço + CTA + prova social + dispensa.
- `popup`  -  interrupção por saída / scroll / tempo na página: gancho, oferta, CTAs de dispensar/aceitar + gatilho + segmentação + limite de frequência + métrica de sucesso.

Se você nomear a superfície em linguagem simples, eu infiro. Se for ambíguo, faço UMA pergunta nomeando as 8 opções.

## Quando usar

- Explícito: "reescreva minha {página inicial / preços / sobre / landing page na URL}", "revisão do fluxo de cadastro", "copy do onboarding dentro do app", "paywall de upgrade", "popup de saída".
- `popup` cobre mais que saída  -  também: "modal de captura de leads", "banner de anúncio para {feature}", "popup de carrinho abandonado", "popup de scroll na {page}", "banner de promoção". Um único formato de especificação: gancho + oferta + CTAs de aceitar/dispensar + gatilho + segmentação + limite de frequência.
- Implícito: depois de `audit-a-surface` (landing-page / form / site-seo) quando o próximo passo é uma reescrita completa, não só uma lista de correções.

## Conexões que eu preciso

Executo trabalho externo através do Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Faltando → nomeio a categoria, peço para você conectá-la na aba Integrações, paro.

- **Web scrape (Firecrawl)**  -  opcional. Se não estiver conectado, recorro a uma busca HTTP básica para a página atual e quaisquer URLs públicas de avaliações, mais rudimentar mas suficiente para citar o que está lá. Para superfícies dentro do produto você também pode colar ou mandar um screenshot.
- **Raspagem de avaliações (Reddit)**  -  opcional, minera subreddits da categoria em busca de frases textuais quando os insights de ligações são escassos.

Se você não tem insights de ligações, a página é tão pesada de JS que a busca básica não retorna nada legível, e você não pode colar algumas citações de clientes, eu paro.

## Informações que eu preciso

Leio seu contexto de marketing primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **O nome e o pitch da sua empresa**  -  Obrigatório. Se faltar, pergunto: "Qual é o nome da empresa, e como você descreve o que ela faz em uma frase?"
- **Sua voz**  -  Obrigatório. Por que preciso: isto é reescrever a sua própria página, tem que soar como você. Se faltar, pergunto: "Conecte sua caixa de enviados para eu amostrar sua voz, ou cole duas ou três coisas que você escreveu."
- **Seu posicionamento**  -  Obrigatório. Se faltar, pergunto: "Quer que eu redija seu posicionamento primeiro? É uma skill só, leva uns cinco minutos."
- **Seu cliente ideal**  -  Obrigatório. Por que preciso: fundamenta as propostas de valor em dores reais do comprador. Se faltar, pergunto: "Quem é o cliente que esta página está tentando converter? Um parágrafo basta, ou me aponte para o seu CRM."
- **A ação principal que esta página deve gerar**  -  Obrigatório para `homepage`, `pricing`, `about`, `landing`. Se faltar, pergunto: "Qual é a única ação que você quer que o visitante tome nesta página, criar conta, agendar uma demo, iniciar um teste, pedir preços?"
- **A URL ou screenshot da página**  -  Obrigatório. Se faltar, pergunto: "Cole a URL da página que você quer reescrever. Se for uma superfície dentro do produto, mande um screenshot ou cole o copy atual."

## Passos

1. **Ler o ledger + posicionamento.** Coleto os campos obrigatórios faltantes conforme acima (UMA pergunta cada, melhor modalidade primeiro). Escrevo atomicamente.
2. **Buscar o estado atual.** Superfícies acessíveis por URL: rodo `composio search web-scrape` e executo pelo slug (Firecrawl / ScrapingBee / equivalente) para puxar o HTML renderizado + texto visível + URLs das imagens principais + CTA atual. Superfícies dentro do produto (onboarding / alguns paywalls / popups): aceito screenshots, Loom, ou copy colado. Nada utilizável → peço uma colagem, paro.
3. **Buscar a linguagem real do cliente.**
   - Tento os artefatos recentes de `analyses/` ou `audits/` deste agente em busca de citações já mineradas.
   - Senão, rodo `composio search` por provedores de raspagem de avaliações (G2, Capterra, Trustpilot, Reddit, App Store), puxo frases textuais. Nada disponível → peço 3-5 citações a você, paro. Nunca invento citações.
4. **Ramificar pela superfície.**
   - `homepage` | `pricing` | `about` | `landing`: enumero as seções a reescrever (título do hero + subtítulo → espaço de prova social → 3-5 propostas de valor amarradas às dores do cliente ideal → como funciona → objeções (do posicionamento) → recapitulação final do CTA). Por seção: **Atual** (citado textualmente) → **Proposto** (na voz do fundador) → **Porquê** (princípio + dor do cliente ideal + afirmação do posicionamento). Dou 2-3 opções de título do hero + CTA principal com a marca "publique este primeiro". Sinalizo qualquer alegação da página atual que contradiga o posicionamento numa seção "Sinalizado" (NÃO reescrevo o posicionamento  -  isso pertence a `set-up-my-marketing-info`).
   - `signup-flow`: mapeio o fluxo como lista enumerada de etapas (entrada → landing → e-mail/SSO → verificação → plano → senha → organização → cobrança). Marco a etapa do evento de conversão. Por etapa: **Necessidade** (manter / fundir / adiar / eliminar), **Atrito** (carga cognitiva / valor ausente / constrangimento no erro / etc.), **Gatilhos de abandono**, e as **Reescritas de copy** completas (título, subtítulo, rótulos, CTA, erros, confirmação). Aponto o que deveria ser adiado para depois da conversão. Termino com um fluxo consolidado de ponta a ponta no estado final + as 3 mudanças para publicar esta semana + contagem de etapas atual vs. recomendada.
   - `onboarding`: nomeio o momento aha (pergunto se não for óbvio). Mapeio as superfícies: tela de boas-vindas → estados vazios → checklist de onboarding (3-5 itens, verbo + resultado, ordenados por proximidade do aha) → tooltips → confirmação do momento aha. Cada superfície: **Atual / Proposto / Porquê** com o princípio nomeado (valor-primeiro, uma-única-próxima-ação, rótulo-puxado-pela-ação, proximidade-do-aha, promessa-no-estado-vazio). Sinalizo problemas de sequenciamento quando o dado pertence ao signup-flow e não aqui (ou vice-versa).
   - `paywall`: **Audito o timing PRIMEIRO**  -  você chegou ao aha antes de isto disparar? O gatilho é comportamental ou temporal? A dispensa é gentil ou punitiva? Timing quebrado → aponto como primeiro problema. Depois audito o conteúdo  -  título (o valor de fazer upgrade, não a limitação do gratuito), comparação de planos (um recomendado, nomes puxados pelo resultado), tratamento de objeções (do posicionamento), posicionamento da prova social, CTA principal (ação + resultado), padrão de dispensa. Sinalizo questões de conformidade / confiança (renovação automática, política de cancelamento, padrão de teste-para-pago).
   - `popup`: esclareço a função em UMA pergunta se não estiver claro (captura de leads / anúncio / carrinho abandonado / promoção / pesquisa / lembrete). Redijo a especificação completa: **Gatilho** (intenção de saída / % de scroll / tempo / comportamental  -  respeitar engajamento mínimo), **Segmentação** (regras de página / visitante / dispositivo / horário), **Limite de frequência** (padrão uma vez por usuário para qualquer coisa acima de banner), **Copy** (título de <10 palavras fundamentado em uma citação nomeada, subtítulo, campos mínimos, CTA com ação + resultado, dispensa sem constrangimento, linha de confiança só se amparada por política), **Métrica de sucesso + limite de segurança**. Nomeio quaisquer antipadrões (dispara-antes-de-merecer, sem-dispensa, scroll-forçado, fechamento-por-culpa).
5. **Escrever** atomicamente em `page-copy/{surface}-{slug}-{YYYY-MM-DD}.md` (`*.tmp` → renomear). Front-matter: `surface`, `url` (se aplicável), `primaryConversion`.
6. **Anexar em `outputs.json`.** Ler, mesclar e escrever atomicamente: `{ id (uuid v4), type: "page-copy", title, summary, path, status: "draft", createdAt, updatedAt }`.
7. **Resumir para você.** A única mudança de maior alavancagem, as 3 mudanças para publicar esta semana, caminho do arquivo completo. Para `paywall`, começo pelo veredicto de timing. Para `signup-flow`, começo pela diferença na contagem de etapas.

## O que eu nunca faço

- Colocar copy no ar. Apenas rascunhos  -  você cola / publica.
- Inventar citações de clientes, estatísticas, depoimentos. Marco TBD.
- Reescrever o posicionamento  -  sinalizo contradições; o documento pertence a `set-up-my-marketing-info`.
- Prometer % de melhoria. Toda variante = hipótese.
- Adicionar padrões obscuros (escassez falsa, scroll forçado, dispensa por culpa, linguagem que envergonha).

## Saídas

- `page-copy/{surface}-{slug}-{YYYY-MM-DD}.md`
- Anexa uma entrada em `outputs.json` com tipo `page-copy`.
