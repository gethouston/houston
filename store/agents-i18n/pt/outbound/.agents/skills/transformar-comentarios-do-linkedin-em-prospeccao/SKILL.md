---
name: transformar-comentarios-do-linkedin-em-prospeccao
title: "Transformar comentários do LinkedIn em prospecção"
description: "Transformo a URL de uma única publicação do LinkedIn em uma campanha de e-mail frio em pausa no Instantly. Extraio todas as pessoas que comentaram, salvo tudo no Airtable, busco e-mails verificados com o Apollo, escrevo com você uma sequência de 3 e-mails, e depois carrego tudo no Instantly. Do início ao fim leva de 30 a 60 minutos, a maior parte na redação dos e-mails. Sempre fica em pausa para você revisar, eu nunca lanço automaticamente. Use para públicos de maior intenção e menor volume (comentar exige esforço)."
version: 1
category: Prospecção
featured: yes
image: envelope-with-arrow
integrations: [apify, airtable, apollo, instantly, linkedin]
---


# Comentários do LinkedIn para Prospecção

Orquestrador do início ao fim: entra a URL de uma publicação do LinkedIn, sai uma campanha do Instantly pausada. Encadeio as cinco subskills com um checkpoint entre cada fase para que você continue no controle enquanto o trabalho pesado acontece automaticamente.

Use isso para **comentaristas** (maior intenção, menor volume). Para quem reagiu (de 5 a 10 vezes mais leads, com perfis completos do LinkedIn anexados), use a `linkedin-reaction-to-outreach`.

## Quando usar

- "Rode o pipeline do LinkedIn nessa publicação: <URL>".
- "Extraia e mande e-mail para esses comentaristas".
- "Prospecção a partir dessa publicação do LinkedIn".
- Um palestrante, concorrente ou formador de opinião publicou algo que acerta em cheio o seu perfil de cliente ideal, e você quer alcançar todo comentarista qualificado em um único movimento.

## Quando NÃO usar

- Buscando pessoas que **reagiram** a uma publicação, use a `linkedin-reaction-to-outreach`. Quem reage é de 5 a 10 vezes mais numeroso e vem com dados de perfil mais ricos.
- Só precisa da lista de comentaristas, sem prospecção, use a `linkedin-comment-scraper` diretamente.
- Só precisa enriquecer uma lista já existente, use a `apollo-enrichment` diretamente.
- Só precisa de textos de e-mail frio sem uma fonte de leads, use a `cold-email-sequence` diretamente.
- Já tem uma lista verificada e a copy pronta, use a `instantly-campaign` diretamente.

## Conexões de que preciso

Eu executo trabalho externo pelo Composio. Antes de rodar essa skill, verifico se cada categoria abaixo está conectada. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Apify** (extração) - para o ator de comentários do LinkedIn. Obrigatório.
- **Airtable** (banco de dados) - para a tabela de acompanhamento de leads. Obrigatório.
- **Apollo** (enriquecimento) - para e-mails verificados além de empresa, cargo e localização. Obrigatório.
- **Instantly** (plataforma de envio) - para criação de campanha e carregamento de leads. Obrigatório.

Se alguma das quatro estiver faltando, eu paro na primeira que faltar e peço para você conectar. O pipeline não roda parcialmente.

## Informações de que preciso

Primeiro eu leio o seu contexto de prospecção. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > URL > texto colado) e espero.

- **A URL da publicação do LinkedIn** - Obrigatório. Motivo: é a entrada da fase 1. Se faltar, eu pergunto: "De qual publicação do LinkedIn eu devo extrair os comentaristas?"
- **Uma base do Airtable** - Obrigatório. Motivo: a fase 2 cria uma nova tabela dentro de uma das suas bases existentes. Se faltar, eu pergunto: "Em qual base do Airtable eu devo criar a tabela de leads? Posso listar as que você tem."
- **Seu primeiro nome como remetente, a frase única sobre o produto e pelo menos um ponto de prova social com números reais** - Obrigatório para a fase 4. Motivo: eu escrevo os e-mails frios na sua voz; sem um ponto de prova real com números reais eu estaria inventando coisas, e isso é uma forma rápida de queimar a campanha. Se faltar, eu pergunto na fase 4 (não agora), para que as três primeiras fases possam rodar em segundo plano.
- **Contas de envio do Instantly** - Opcional. Motivo: o padrão é anexar toda conta de envio conectada. Se você quiser só algumas específicas, me avise com antecedência.

## O pipeline

```
URL da publicação do LinkedIn
       |
       v
[1. linkedin-comment-scraper]   Extração no Apify, remoção de duplicados por URL de perfil
       |
       v
[2. airtable-lead-loader]       Cria a tabela, carrega em lote com agentes em paralelo
       |
       v
[3. apollo-enrichment]          Faz o match de e-mails em massa (lotes de 10), atualiza o Airtable, cria contatos no Apollo
       |
       v
[4. cold-email-sequence]        Escreve 3 e-mails com você, um de cada vez, método de James Shields
       |
       v
[5. instantly-campaign]         Cria a campanha, sanitiza os corpos, carrega os leads, anexa as contas - PAUSADA
       |
       v
Campanha pausada, pronta para sua revisão
```

## Passos

1. **Validar as entradas.** Verifique se a URL é de uma publicação do LinkedIn (não um perfil, não um artigo), confirme as quatro conexões do Composio, leia `config/context-ledger.json`. Gere um `runId` no formato `{YYYY-MM-DD}-{post-slug}` e crie `runs/{runId}/notes.md` para o diário da execução.

2. **Fase 1, extrair os comentaristas.** Chame a `linkedin-comment-scraper` com a URL da publicação. O resultado fica em `runs/{runId}/scrape.json`. Adicione o resumo em `runs/{runId}/notes.md`.

   **Checkpoint.** Avise o usuário: "Extraí {N} comentaristas únicos da publicação de {author}. Seguindo para o Airtable."

3. **Fase 2, carregar no Airtable.** Chame a `airtable-lead-loader` com `runs/{runId}/scrape.json` e a base escolhida. O nome da tabela é `LinkedIn Commenters - {author} - {YYYY-MM-DD}`. Adicione o resumo em `runs/{runId}/notes.md` com o ID da tabela e a contagem carregada.

   **Checkpoint.** Avise o usuário: "Carreguei {N} registros no Airtable. Começando o enriquecimento no Apollo."

4. **Fase 3, enriquecer com o Apollo.** Chame a `apollo-enrichment` com a base + tabela do Airtable. Resultado: linhas do Airtable atualizadas com e-mail + empresa + cargo + localização, e contatos criados no Apollo sob o rótulo `LinkedIn Comments - {author} Post`. Rebusque as linhas que voltaram com e-mail verificado e salve em `runs/{runId}/contacts.json`. Adicione o resumo da taxa de match em `runs/{runId}/notes.md`.

   **Checkpoint.** Avise o usuário: "Encontrei e-mails para {M} de {N} comentaristas ({M/N}% de taxa de match). {M} contatos prontos para prospecção. Seguindo para a sequência de e-mails."

5. **Fase 4, escrever a sequência com você.** Chame a `cold-email-sequence`. Essa é a **fase interativa**, eu trabalho com você um e-mail de cada vez, travando cada um antes de passar para o próximo. Salve em `sequences/{runId}-sequence.md`. Adicione o resumo do travamento em `runs/{runId}/notes.md`.

   **Checkpoint.** Avise o usuário: "Sequência travada. Carregando no Instantly."

6. **Fase 5, criar a campanha no Instantly.** Chame a `instantly-campaign` com `sequences/{runId}-sequence.md` e `runs/{runId}/contacts.json`. O nome da campanha é `LinkedIn - {author} - {short topic}`. Sempre pausada. Adicione o ID da campanha no Instantly e o resumo de carregamento de leads em `runs/{runId}/notes.md`. Adicione uma linha em `campaigns.json` com `status: "paused"`.

7. **Resumo final.** Um bloco curto para o usuário:
   - Nome da campanha + status (pausada).
   - Quantidade de leads carregados.
   - Contas de envio anexadas.
   - Horário (seg-sex, 8h-17h no seu fuso horário padrão).
   - "Revise no Instantly. Ative quando estiver pronto, eu não faço isso por você."

## Resultados

- `runs/{runId}/scrape.json` - lista de comentaristas sem duplicados da fase 1.
- `runs/{runId}/contacts.json` - contatos enriquecidos pelo Apollo com e-mails verificados (alimenta o carregamento no Instantly).
- `runs/{runId}/notes.md` - diário da execução com checkpoints, contagens e decisões.
- `sequences/{runId}-sequence.md` - sequência travada de 3 e-mails.
- Nova tabela no Airtable `LinkedIn Commenters - {author} - {date}` preenchida com o esquema completo de acompanhamento de leads.
- Novo rótulo de contato no Apollo `LinkedIn Comments - {author} Post`.
- Nova campanha no Instantly (pausada) com todos os leads carregados e todas as contas de envio anexadas.
- `outputs.json` - uma linha por artefato de cada fase (extração, carga no Airtable, enriquecimento, sequência, campanha).
- `leads.json` - uma linha por lead sobrevivente (sem duplicados por `profileUrl` entre execuções).
- `campaigns.json` - uma linha para a nova campanha pausada.

## O que eu nunca faço

- **Lançar a campanha.** Sempre fica pausada ao final da fase 5. Você aperta Ativar.
- **Pular o travamento por e-mail na fase 4.** Cada e-mail é revisado e aprovado por você antes de eu avançar para o próximo. Sem escrever os 3 de uma vez.
- **Colocar leads sem e-mail verificado no Instantly.** As linhas de "sem match" do Apollo ficam no Airtable para você decidir o que fazer depois.
- **Retomar uma execução parcialmente falha adivinhando.** Se a fase 3 falhar no meio, eu paro e te digo exatamente quais linhas do Airtable estão enriquecidas e quais não estão, para que você decida se quer retomar dali ou recomeçar do zero.
- **Fixar no código IDs de ator do Apify, IDs de base do Airtable, rótulos do Apollo, ou IDs de campanha do Instantly.** Tudo descoberto via Composio em tempo de execução.
