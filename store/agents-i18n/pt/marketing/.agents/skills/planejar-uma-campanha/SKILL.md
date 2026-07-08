---
name: planejar-uma-campanha
title: "Planejar uma campanha"
description: "Planejo uma especificação completa de campanha baseada no seu posicionamento. Escolha o tipo: uma campanha paga com público e orçamento, um plano de lançamento de produto, uma sequência de ciclo de vida, uma série de boas-vindas, um e-mail para reter clientes em risco de cancelamento, ou um anúncio de funcionalidade com copy para e-mail e dentro do app. Apenas especificações, nunca envio nem lanço nada."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [hubspot, stripe, linkedin, mailchimp, customerio, googleads, metaads]
---


# Planejar uma Campanha

Uma skill, toda especificação de campanha. O parâmetro `type` escolhe o formato; posicionamento, voz, cliente ideal, "só rascunhos, sem táticas de culpa" são compartilhados.

## Parâmetro: `type`

- `paid` - público + palavras-chave / posicionamento de anúncio + estrutura de grupo de anúncios + orçamento + requisito de landing page + KPIs.
- `launch` - plano de 2 semanas sequenciado do Dia -7 ao Dia 0 ao Dia +7, cada tarefa marcada com a skill dentro DESTE agente que a executa.
- `lifecycle-drip` - sequência disparada por evento com gatilho + evento-meta + regras de frequência + ramificação por ação do usuário + e-mails redigidos.
- `welcome` - série de 5 e-mails para novos cadastros (Dia 0 / 1 / 3 / 7 / 14 padrão, pode sobrescrever qualquer cadência).
- `churn-save` - e-mail de retenção oferecendo UMA opção genuína (pausa / downgrade / atendimento consultivo / reembolso). Sem táticas de culpa.
- `announcement` - copy de e-mail + copy correspondente no app (banner + modal + aviso de estado vazio), tudo ligado ao mesmo CTA principal.

O usuário nomeia o tipo em português simples, eu infiro. Se ambíguo, faço UMA pergunta nomeando as 6 opções.

## Quando usar

- Explícito: "planejar uma campanha paga em {channel}", "planejar o lançamento de {feature}", "desenhar um drip para {segment}", "redigir uma série de boas-vindas", "e-mail de retenção para {account}", "redigir o anúncio de {feature}".
- Implícito: chamado depois de `audit-a-surface` (landing-page / site-seo) quando o fundador está pronto para investir orçamento por trás de uma página já corrigida.

## Conexões que preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar, verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações e paro.

- **Plataforma de e-mail (Customer.io, Loops, Mailchimp, Kit, etc.)** - redigir e-mails de drip / boas-vindas / retenção / anúncio no seu remetente. Obrigatório para `lifecycle-drip`, `welcome`, `churn-save`, `announcement`.
- **Plataformas de anúncio (Google Ads, Meta Ads, LinkedIn Ads)** - puxar conta, público e formato de palavras-chave para o briefing encaixar na sua conta real. Obrigatório para `paid` (o canal que você está planejando).
- **CRM (HubSpot, Salesforce, Attio)** - segmentar públicos e puxar gatilhos comportamentais. Opcional, mas melhora a precisão da segmentação.
- **Cobrança (Stripe)** - sinalizar sinais de downgrade e cancelamento para `churn-save`. Obrigatório para `churn-save`.

Se nenhuma das categorias obrigatórias estiver conectada para o seu tipo de campanha, eu paro e peço para você conectar a que se encaixa (seu ESP para trabalho de lifecycle, a plataforma de anúncios para paid).

## Informações que preciso

Eu leio primeiro o seu contexto de marketing. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > upload de arquivo > URL > colar) e espero.

- **Seu posicionamento** - Obrigatório para todo tipo. Por que preciso: segmentação, tratamento de objeções e o CTA principal partem dele. Se estiver faltando, eu pergunto: "Quer que eu redija seu posicionamento primeiro? É uma skill, leva uns cinco minutos."
- **Sua voz** - Obrigatório para `lifecycle-drip`, `welcome`, `churn-save`, `announcement`. Por que preciso: e-mails escritos com voz de chatbot são deletados. Se estiver faltando, eu pergunto: "Conecte sua caixa de enviados para eu captar sua voz, ou cole dois ou três e-mails que você já enviou."
- **Seu cliente ideal** - Obrigatório. Por que preciso: define a segmentação e os ângulos de copy. Se estiver faltando, eu pergunto: "Quem é o cliente que você está tentando conquistar? Um parágrafo já serve, ou me aponte para o seu CRM."
- **Sua plataforma de e-mail e a jornada do produto** - Obrigatório para `lifecycle-drip`, `welcome`, `churn-save`, `announcement`. Por que preciso: o plano de drip se conecta ao seu evento real de ativação. Se estiver faltando, eu pergunto: "Qual ferramenta de e-mail você usa, e qual é o seu momento de ativação, a coisa que um usuário novo precisa fazer para o produto fazer clique?"
- **Seus canais de anúncio, analytics e conversão principal** - Obrigatório para `paid`. Se estiver faltando, eu pergunto: "Para qual plataforma de anúncios estamos planejando, e qual é o único evento de conversão que a campanha precisa gerar?"
- **Sua política de retenção** - Obrigatório para `churn-save`. Por que preciso: eu não vou redigir ofertas que você não pode cumprir. Se estiver faltando, eu pergunto: "Qual é a única oferta genuína que você faria a um cliente cancelando, uma pausa, um downgrade, uma ligação consultiva, ou uma janela de reembolso?"

## Passos

1. **Ler o registro + posicionamento.** Coletar os campos obrigatórios que faltarem, conforme a lista acima (UMA pergunta cada, priorizando a melhor modalidade).
2. **Ramificar pelo tipo.**
   - `paid`: rodar `composio search {channel}` (googleads / metaads / linkedin-ads) para achar os slugs da plataforma. Se conectado, chamar list-accounts / list-keywords / list-audiences. Redigir o briefing: **Objetivo** (uma frase ligada à conversão principal), **Público** (palavras-chave para busca; interesses / lookalikes / cargos para social, com base no cliente ideal), **Plano de orçamento** (diário + mensal, dividido por grupo de anúncios), **Estrutura de grupos de anúncios** (2-5 grupos com tema + segmentação de amostra), **Ângulos criativos** (3-5 ligados a dores / diferenciais, repassar para `write-a-post` ou uma skill dedicada de copy de anúncio para a redação exata), **Requisito de landing page** (qual URL por grupo; sinalizar se `audit-a-surface` surface=landing-page deveria rodar antes), **Metas de KPI** (custo por clique / custo por mil impressões / custo por aquisição / taxa de cliques, com fonte citada), **Rastreamento** (eventos + UTMs), **Checklist de lançamento**.
   - `launch`: perguntar por qualquer input de lançamento faltante em UMA pergunta direta (nome da funcionalidade + data-alvo, a dor do "por que agora", segmento de público, escala = leve / padrão / grande, padrão é standard). Redigir um plano sequenciado em três fases:
     - **Pré-lançamento (Dia -7 ao Dia -1)** - diferença de posicionamento + narrativa do lançamento, briefing de post de blog (→ `write-a-post` surface=blog), estudo de caso se aplicável, briefing de criativo pago (→ esta skill type=paid), atualizações de landing page (→ `write-my-page-copy` + `audit-a-surface` surface=landing-page), especificação de e-mail de anúncio + in-app (→ esta skill type=announcement), calendário de teasers entre plataformas sociais (→ `write-a-post` channels).
     - **Dia do lançamento (Dia 0)** - sequência hora a hora, o que sai quando, quem aprova.
     - **Pós-lançamento (Dia +1 ao Dia +14)** - métricas a observar, conteúdo de acompanhamento (estudo de caso / post de lições aprendidas), regras de escalonamento / interrupção do pago, atualização do drip de lifecycle, retrospectiva da próxima semana via `check-my-marketing` subject=marketing-health.
     Toda tarefa prefixada com a skill dentro do agente que a possui (por exemplo, `[write-a-post:blog]`, `[plan-a-campaign:paid]`, `[write-my-page-copy:landing]`). Sinalizar "o que poderia matar esse lançamento", 3 riscos + mitigações.
   - `lifecycle-drip`: ler / capturar `domains.email.journey`. Nomear o **gatilho** (evento ou evento ausente que inscreve o usuário) e o **evento-meta** (que os tira com sucesso). Cadência padrão de 3 toques em 14 dias, intervalo mínimo de 72h (respeitar regras mais rígidas do usuário). Cada e-mail depois do primeiro se ramifica pela ação do usuário (ação-meta → sai; abriu sem ação → variante A reformulando o valor; não abriu → variante B com assunto novo, corpo mais curto e horário de envio diferente; sem ação depois do último → marcar como frio, sair, opcionalmente inscrever em nutrição de menor frequência). Redigir assunto + preview + corpo + CTA único + métrica de sucesso por e-mail. Incluir uma árvore em ASCII / tópicos das ramificações.
   - `welcome`: cadência padrão Dia 0 / 1 / 3 / 7 / 14. Funções padrão por e-mail: (1) boas-vindas + configuração de caminho mais rápido, (2) momento aha com uma próxima ação concreta, (3) prova social / resultado de cliente, (4) formação de hábito / expansão de caso de uso, (5) incentivo de upgrade / encaixe de plano. Cada e-mail: assunto (≤50 caracteres, sem CAIXA-ALTA), preview (50-90 caracteres), corpo (texto simples em primeiro lugar, com voz alinhada, referenciando o CTA principal do posicionamento), um CTA principal, métrica de sucesso (um número que esse e-mail deve mover).
   - `churn-save`: ler ou criar a `save-policy` no registro (perguntar UMA questão se faltando: "o que você está genuinamente disposto a oferecer? pausa de quanto tempo / downgrade para qual plano / atendimento consultivo com quem / janela de reembolso de quanto tempo?"). Escolher UMA oferta genuína (não empilhar). Redigir: assunto (sem culpa, sem falsa escassez), preview, corpo (3 parágrafos curtos, reconhecer, oferecer, perguntar o que não estava funcionando; um CTA principal = a oferta, um secundário = confirmar cancelamento). Nunca: "vamos sentir sua falta", contadores regressivos, urgência falsa, "outros clientes estão...", emoji de lágrima.
   - `announcement`: procurar um artefato recente do tipo `launch` em `campaigns/`; se existir, ligar o anúncio a ele (mesmo CTA principal, narrativa, público). Se ausente, perguntar nome da funcionalidade + proposta de valor + segmento + CTA principal. Redigir AMBOS: **E-mail** (assunto ≤60 caracteres nomeando a funcionalidade OU o trabalho a ser feito, preview, corpo cobrindo por-que-agora / o-que-faz / como-experimentar / prova, um CTA principal, métrica de sucesso = ativação dentro de N dias). **Copy no app** - banner (uma linha dispensável ≤90 caracteres), modal (título + corpo de 1-2 linhas + botão principal alinhado ao CTA + secundário "agora não"), estado vazio / aviso contextual (uma linha exatamente na superfície onde a funcionalidade melhora).
3. **Escrever** atomicamente em `campaigns/{type}-{slug}.md` (`*.tmp` → renomear). Slug: canal+tema para paid, funcionalidade+mês para launch, nome da campanha ou segmento para lifecycle-drip, nome da variante para welcome, conta-ou-persona para churn-save, funcionalidade para announcement. O front-matter carrega `type`, `primaryCta`, mais campos específicos do tipo (trigger + goalEvent para drips, cadence para welcome, offer para churn-save, launchPlan path para announcement).
4. **Adicionar ao `outputs.json`** - ler-mesclar-escrever atomicamente: `{ id (uuid v4), type: "campaign", title, summary, path, status: "draft", createdAt, updatedAt }`.
5. **Resumir para o usuário.** Um parágrafo: objetivo + público + maior questão em aberto + caminho. Para `launch`, liderar com as 3 tarefas de maior alavancagem desta semana. Para `churn-save`, liderar com uma oferta genuína. Para `announcement`, liderar com um CTA conectando e-mail + banner + modal + aviso.

## O que eu nunca faço

- Lançar campanha, enviar e-mail, gastar orçamento de anúncio. Só rascunhos / especificações.
- Usar culpa, falsa escassez, contadores regressivos, dark patterns em copy de retenção / reengajamento / pop-up.
- Oferecer algo que o usuário não pode entregar ("atendimento consultivo grátis para sempre").
- Inventar fatos de clientes, dados de marcos, números de retenção, gastos com anúncio de concorrentes.
- Fixar nomes de ferramentas no código. Descoberta via Composio só em tempo de execução.

## Resultados

- `campaigns/{type}-{slug}.md`
- Adiciona uma entrada ao `outputs.json` com o tipo `campaign`.
