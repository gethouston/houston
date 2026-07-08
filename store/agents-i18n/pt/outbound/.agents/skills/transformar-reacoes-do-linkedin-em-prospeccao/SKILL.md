---
name: transformar-reacoes-do-linkedin-em-prospeccao
title: "Transformar reações do LinkedIn em prospecção"
description: "É o mesmo pipeline do início ao fim da versão de comentários, mas para as pessoas que reagiram a uma publicação do LinkedIn. Gera de 5 a 10 vezes mais leads do que os comentaristas, e a extração retorna perfis completos do LinkedIn (experiência, formação, habilidades, certificações, localização, número de conexões) em uma única etapa. É ideal para estratégias de público mais amplo, quando você quer volume e dados ricos para personalização. Sempre fica em pausa para você revisar, eu nunca lanço automaticamente."
version: 1
category: Prospecção
featured: yes
image: envelope-with-arrow
integrations: [apify, airtable, apollo, instantly, linkedin]
---


# Reações do LinkedIn para prospecção

Orquestrador do início ao fim: entra a URL de uma publicação do LinkedIn, sai uma campanha do Instantly pausada. Mesma cadeia de cinco fases da `linkedin-comment-to-outreach`, mas eu extraio quem **reagiu** em vez de quem comentou.

Por que reações? Dois motivos:

1. **Volume**, quem reage costuma superar em 5 a 10 vezes quem comenta. Uma publicação com 30 comentaristas costuma ter de 200 a 500 pessoas que reagiram.
2. **Perfis mais ricos**, a extração de reações retorna o perfil completo do LinkedIn de cada pessoa (histórico de experiência, formação, habilidades, certificações, localização, número de conexões) direto em uma única chamada no Apify. A extração de comentários só retorna campos superficiais. Isso eleva bastante o teto de personalização.

Trade-off: reagir é um sinal de menor esforço do que comentar. Você troca intenção por lead por volume e profundidade de dados.

## Quando usar

- "Rode o pipeline de reações do LinkedIn nesta publicação: <URL>".
- "Extraia e envie e-mail para todo mundo que reagiu a esta publicação".
- Uma publicação está atingindo amplamente o seu perfil de cliente ideal e você quer cobertura máxima.
- Você quer os dados completos do perfil do LinkedIn anexados a cada lead (para personalização no corpo do e-mail, não só no assunto).
- Prospecção de público de nicho: "contadores que reagiram a uma publicação sobre planejamento tributário", "founders que reagiram a um post sobre captação".

## Quando NÃO usar

- Você só quer **comentaristas** (intenção maior por lead), use a `linkedin-comment-to-outreach`.
- Só precisa da lista de quem reagiu, sem prospecção, use a `linkedin-reaction-scraper` diretamente.
- Só precisa enriquecer uma lista já existente, use a `apollo-enrichment` diretamente.
- Já tem uma lista verificada e a copy pronta, use a `instantly-campaign` diretamente.

## Conexões de que preciso

Eu executo trabalho externo pelo Composio. Antes de rodar esta skill, verifico se cada categoria abaixo está conectada. Se estiver faltando, eu nomeio a categoria, peço para você conectar na aba Integrações e paro.

- **Apify** (extração), para o ator de reações do LinkedIn (com `profileScraperMode: "main"`). Obrigatório.
- **Airtable** (banco de dados), para a tabela de acompanhamento de leads. Obrigatório.
- **Apollo** (enriquecimento), para e-mails verificados além de empresa, cargo e localização. Obrigatório.
- **Instantly** (plataforma de envio), para criação de campanha e carregamento de leads. Obrigatório.

Se alguma das quatro estiver faltando, eu paro na primeira que faltar e peço para você conectar. O pipeline não roda parcialmente.

## Informações de que preciso

Primeiro eu leio o seu contexto de prospecção. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples e espero.

- **A URL da publicação do LinkedIn**, obrigatório. Motivo: entrada da fase 1.
- **Uma base do Airtable**, obrigatório. Motivo: a fase 2 cria uma nova tabela dentro de uma das suas bases.
- **Seu primeiro nome como remetente, a frase única sobre o produto e pelo menos um ponto de prova social com números reais**, obrigatório para a fase 4. Perguntado nessa hora, não agora.
- **Contas de envio do Instantly**, opcional. Padrão é "todas as conectadas".

## O pipeline

```
URL da publicação do LinkedIn
       |
       v
[1. linkedin-reaction-scraper]  Extração no Apify com profileScraperMode=main, deduplicação por URL de perfil
       |
       v
[2. airtable-lead-loader]       Cria a tabela com esquema específico de reações, carrega em lote
       |
       v
[3. apollo-enrichment]          Faz o match de e-mails em massa (lotes de 10), atualiza o Airtable, cria contatos no Apollo
       |
       v
[4. cold-email-sequence]        Escreve 3 e-mails junto com você, aproveitando os dados ricos de perfil
       |
       v
[5. instantly-campaign]         Cria a campanha, sanitiza os corpos, carrega os leads, anexa as contas, PAUSADA
       |
       v
Campanha pausada, pronta para sua revisão
```

## Passos

1. **Validar entradas.** Verifico se a URL é de uma publicação do LinkedIn, confirmo as quatro conexões do Composio, leio `config/context-ledger.json`. Gero um `runId` no formato `{YYYY-MM-DD}-{post-slug}-reactions` e crio `runs/{runId}/notes.md`.

2. **Fase 1, extrair quem reagiu.** Chamo `linkedin-reaction-scraper` com a URL da publicação e `profileScraperMode: "main"`, para o resultado incluir perfis completos. O resultado fica em `runs/{runId}/scrape.json`. Adiciono um resumo em `runs/{runId}/notes.md`.

   **Checkpoint.** Aviso você: "Extraí {N} pessoas únicas que reagiram à publicação de {author} (com perfis completos). Seguindo para o Airtable."

3. **Fase 2, carregar no Airtable.** Chamo `airtable-lead-loader` com `runs/{runId}/scrape.json` e a base escolhida. Uso o **esquema de reações**, que tem colunas extras para `experienceTopRole`, `educationTopSchool`, `topSkills`, `connectionsCount`. O nome da tabela é `LinkedIn Reactors - {author} - {YYYY-MM-DD}`. Adiciono um resumo em `runs/{runId}/notes.md` com o ID da tabela e a contagem carregada.

   **Checkpoint.** Aviso você: "Carreguei {N} registros no Airtable com os dados completos de perfil. Começando o enriquecimento no Apollo."

4. **Fase 3, enriquecer com o Apollo.** Chamo `apollo-enrichment` com a base e a tabela do Airtable. Igual ao pipeline de comentários: match em massa em lotes de 10, atualizo as linhas do Airtable, crio contatos no Apollo sob o rótulo `LinkedIn Reactions - {author} Post`. Salvo as linhas com e-mail verificado em `runs/{runId}/contacts.json`. Adiciono o resumo da taxa de match.

   **Checkpoint.** Aviso você: "Encontrei e-mails para {M} de {N} pessoas que reagiram ({M/N}% de taxa de match). {M} contatos prontos para prospecção. Seguindo para a sequência de e-mails."

5. **Fase 4, escrever a sequência junto com você.** Chamo `cold-email-sequence` com uma sinalização de que há dados de perfil disponíveis. Quem escreve a sequência usa `experienceTopRole`, `educationTopSchool` e `topSkills` para sugerir espaços de personalização no corpo do e-mail (por exemplo, "vi que você está focado em {topSkill}"), mas as regras do James Shields continuam valendo: o assunto é a única personalização garantidamente real, o corpo usa `{{firstName}}` e no máximo UM campo de modelo por e-mail. Salvo em `sequences/{runId}-sequence.md`.

   **Checkpoint.** Aviso você: "Sequência travada. Carregando no Instantly."

6. **Fase 5, criar a campanha no Instantly.** Chamo `instantly-campaign` com `sequences/{runId}-sequence.md` e `runs/{runId}/contacts.json`. O nome da campanha é `LinkedIn Reactions - {author} - {short topic}`. Sempre pausada. Adiciono o ID da campanha no Instantly e o resumo de carregamento de leads. Adiciono uma linha em `campaigns.json` com `status: "paused"`.

7. **Resumo final.** Um bloco curto para você:
   - Nome da campanha e status (pausada).
   - Quantidade de leads carregados.
   - Contas de envio anexadas.
   - Cronograma (segunda a sexta, das 8h às 17h no seu fuso padrão).
   - "Revise no Instantly. Ative quando estiver pronto, eu não faço isso por você."

## Saídas

- `runs/{runId}/scrape.json`, lista deduplicada de quem reagiu, com perfis completos.
- `runs/{runId}/contacts.json`, contatos enriquecidos pelo Apollo com e-mails verificados.
- `runs/{runId}/notes.md`, diário de cada execução.
- `sequences/{runId}-sequence.md`, sequência travada de 3 e-mails.
- Nova tabela no Airtable `LinkedIn Reactors - {author} - {date}` populada com o esquema de reações.
- Novo rótulo de contato no Apollo `LinkedIn Reactions - {author} Post`.
- Nova campanha no Instantly (pausada).
- `outputs.json`, `leads.json`, `campaigns.json`, linhas de índice.

## O que eu nunca faço

- **Lançar a campanha.** Sempre fica pausada.
- **Pular a trava por e-mail na fase 4.** Cada e-mail é aprovado antes do próximo.
- **Personalizar demais o corpo usando campos de perfil antigos ou rasos.** A experiência do perfil pode estar desatualizada há anos, trato como uma pista, não como verdade absoluta. Se `experienceTopRole` tiver mais de 3 anos ou trouxer o placeholder "Open to work", eu removo do conjunto de personalização daquele lead.
- **Enviar leads sem e-mail verificado para o Instantly.**
- **Fixar no código os IDs de ator do Apify, IDs de base do Airtable, rótulos do Apollo, IDs de campanha do Instantly.**
