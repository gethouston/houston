---
name: avaliar-uma-proposta-recebida
title: "Avaliar uma proposta recebida"
description: "Avalie qualquer proposta recebida que precise da sua decisão com base em critérios reais, em vez de decidir no feeling. Coloque a proposta de um advisor, um pedido de parceria, uma solicitação de imprensa ou uma candidatura genérica de fornecedor, e eu avalio contra seus critérios salvos, reúno evidências de sinais públicos, e gero uma recomendação de aprovar, recusar ou pedir mais informações, junto com a linha de evidência mais relevante."
version: 1
category: Operações
featured: no
image: clipboard
---


# Avaliar uma proposta recebida

Motor genérico de rubrica de aprovação para qualquer proposta recebida que precise de decisão do fundador. Triagem específica de fornecedor → habilidade `vet-a-vendor` (critérios de compras, pasta diferente).

## Quando usar

- "avalie esta candidatura de fornecedor contra nossos critérios" (específico de fornecedor → `vet-a-vendor`).
- "avalie estes candidatos a advisor".
- "essa parceria faz sentido".
- "devo aceitar essa solicitação de imprensa".
- "rode o fluxo de aprovação nisso".

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, eu verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Pesquisa na web** (Exa, Perplexity, Firecrawl) - Obrigatório. Extrai sinais públicos sobre quem enviou para verificar afirmações e identificar alertas.
- **Caixa de entrada** (Gmail, Outlook) - Opcional. Permite que eu confira correspondência anterior com quem enviou para a recomendação refletir o histórico.

Se nenhum provedor de pesquisa na web estiver conectado, eu paro e peço para você conectar um provedor de pesquisa primeiro.

## Informações que eu preciso

Eu leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > arquivo enviado > URL > colar) e espero.

- **A proposta em si** - Obrigatório. Por que eu preciso: eu avalio o que está na minha frente. Se estiver faltando, eu pergunto: "Envie a proposta, pitch, candidatura, solicitação, ou cole a troca de e-mails."
- **Rubrica de aprovação** - Obrigatório. Por que eu preciso: avaliação ad-hoc não é reproduzível. Se estiver faltando, eu pergunto: "Quais critérios eu devo usar? Cole eles, ou diga 'padrão' e eu salvo uma rubrica inicial para este tipo de proposta que você pode editar depois."
- **Prioridades ativas** - Obrigatório. Por que eu preciso: a pontuação de encaixe com prioridades depende delas. Se estiver faltando, eu pergunto: "Quais são as 2 a 3 coisas que a empresa está priorizando neste trimestre?"
- **Limites inegociáveis** - Opcional. Por que eu preciso: permite recusar de cara qualquer coisa que os viole. Se você não tiver isso, eu sigo em frente com dado pendente usando os padrões do workspace.

## Passos

1. **Leio `context/operations-context.md`.** Prioridades ativas, limites inegociáveis, posições específicas do fundador ancoram toda avaliação de rubrica. Se estiver faltando → `set-up-my-ops-info` primeiro, paro.

2. **Leio `config/approval-rubrics.md`.** Mapeio o tipo de proposta para a rubrica. Arquivo ausente ou sem rubrica correspondente → pergunto ao fundador: "Quais critérios eu devo usar? Cole eles, ou eu posso salvar uma rubrica padrão para {tipo de proposta} que você pode editar depois."

   **Rubricas padrão** (usadas se o fundador disser "padrão"):

   - **vendor-app** (fornecedor / vendedor genérico recebido): encaixe com prioridades, compatibilidade de tamanho/estágio, busca por alertas (incidentes públicos), verificação de referência (S/N), fricção para experimentar.
   - **advisor**: autoridade no domínio, acesso (a quem abriria portas), tempo de dedicação, alinhamento de remuneração.
   - **partnership**: público mútuo, capacidade mútua, vantagem assimétrica (eles precisam mais de nós do que nós deles), custo de saída.
   - **press**: encaixe com o público, qualidade das perguntas, custo de tempo do fundador, ganho reputacional.

3. **Reúno evidências.**
   - Leio a proposta que o fundador colou ou o link.
   - `composio search research` → sinais públicos sobre quem enviou (site, atividade recente, menções).
   - `composio search inbox` → correspondência anterior com a pessoa ou domínio.
   - Se as afirmações da proposta forem verificáveis → verifico (ex.: "captou uma Série B mês passado" → checagem rápida de notícias).

4. **Avalio contra a rubrica.**
   - Cada critério: nota (1 a 5 ou verde/amarelo/vermelho conforme a rubrica) + 1 a 2 linhas de evidência. Cito links.
   - Geral: soma ponderada se a rubrica especifica pesos; caso contrário, veredito qualitativo consolidado.

5. **Produzo a recomendação.**
   - **Aprovar** - encaixe + sem alertas + evidência forte.
   - **Recusar** - descompasso claro ou alertas; declaro os 2 principais motivos.
   - **Mais informações** - em cima do muro; listo 2 a 3 perguntas específicas que o fundador deveria fazer para desempatar.

6. **Escrevo** em `approvals/{slug}.md` com:
   - Resumo da proposta (1 parágrafo).
   - Rubrica + tabela de pontuação (critério | nota | evidência).
   - Achados de sinais públicos.
   - Resumo de correspondência anterior (se houver).
   - Recomendação + justificativa de 3 linhas.
   - Se "mais informações", as perguntas de acompanhamento exatas.

7. **Escritas atômicas** - `*.tmp` → renomear.

8. **Adiciono a `outputs.json`** com `type: "approval"`, status "draft" (fundador marca `ready` depois de decidir).

9. **Resumo para o usuário** - recomendação + a linha de evidência mais decisiva. Nunca "aprovar" sem nomear a coisa nº 1 que faria o fundador se arrepender.

## Saídas

- `approvals/{slug}.md`
- Adiciona a `outputs.json` com `type: "approval"`, status "draft".

## O que eu nunca faço

- **Fechar a decisão.** Eu recomendo; o fundador aprova/recusa.
- **Enviar confirmação ou recusa por e-mail** para quem enviou. Isso é trabalho da `draft-a-message` depois que o fundador decide.
- **Usar rubrica não salva.** Se pedirem avaliação sem rubrica → peço uma primeiro. Avaliação ad-hoc não é reproduzível.
