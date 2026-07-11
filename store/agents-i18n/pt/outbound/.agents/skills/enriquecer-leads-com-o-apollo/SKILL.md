---
name: enriquecer-leads-com-o-apollo
title: "Enriquecer leads com o Apollo"
description: "Busco e-mails verificados para uma lista de leads usando o bulk match do Apollo (em lotes de 10), atualizo as linhas do Airtable com e-mail, empresa, cargo e localização, e crio contatos no Apollo sob um rótulo nomeado para que os leads apareçam nos seus fluxos de trabalho do CRM da Apollo. É a fase 3 dos dois pipelines, e pode ser executada de forma independente se você tiver uma tabela do Airtable já carregada pelo carregador de leads."
version: 1
category: Prospecção
featured: no
image: magnifying-glass-tilted-left
integrations: [airtable, apollo]
---


# Enriquecimento com o Apollo

Pegue uma lista de leads em uma tabela do Airtable e encontre e-mails verificados para o máximo possível usando o endpoint de bulk match do Apollo. Atualiza as linhas do Airtable no lugar com e-mail, empresa, cargo e localização, e cria contatos no Apollo sob um rótulo nomeado para que os leads cheguem aos seus fluxos de trabalho do CRM da Apollo. A taxa de match depende muito do público, espere de 50 a 70% em públicos de fundadores ou operadores dos EUA, mais baixo em públicos de consumidores ou fora dos EUA.

## Quando usar

- "Enriqueça esses leads com o Apollo: <tabela do Airtable>".
- "Encontre e-mails para as linhas dessa tabela".
- Fase 3 de qualquer um dos pipelines do LinkedIn (chamado pelo orquestrador).
- Você tem uma tabela do Airtable preenchida com `Profile URL`s e quer anexar e-mails.

## Quando NÃO usar

- Os leads ainda não estão no Airtable, carregue-os primeiro com `airtable-lead-loader`.
- Você só quer **ler** dados do Apollo, não modificar o Airtable, essa skill escreve de volta no Airtable como parte do seu contrato; se você só precisa de uma consulta pontual no Apollo, faça isso manualmente.

## Conexões de que preciso

- **Airtable** (banco de dados) - Obrigatório. Leio as linhas e depois escrevo de volta os campos de enriquecimento.
- **Apollo** (enriquecimento) - Obrigatório. Uso o endpoint `apollo_people_bulk_match` e o endpoint `apollo_contacts_create` via Composio.

Se algum estiver faltando, eu paro e peço para você conectar.

## Informações de que preciso

- **O ID da base do Airtable + o ID da tabela** - Obrigatório. Se chamado por um orquestrador, os dois já vêm prontos. Se chamado de forma independente, listo as bases e tabelas e pergunto qual delas se houver alguma ambiguidade.
- **Um rótulo de contato no Apollo** - Opcional. O padrão é `LinkedIn {sourceType} - {sourceAuthor} Post`, derivado dos campos `Source Type` e `Source Author` da tabela (cada linha de uma dada tabela tem a mesma origem). Pode ser sobrescrito por chamada.

## Passos

1. **Puxar todos os registros.** Percorra a tabela do Airtable 100 registros por vez até terminar. Colete as linhas em que `Email` está vazio (não reenriqueça linhas que já têm um e-mail). Guarde o `Profile URL`, `Full Name`, `Headline` de origem, e o `record_id` do Airtable de cada linha.

2. **Agrupar em lotes de 10.** O `apollo_people_bulk_match` do Apollo aceita até 10 consultas por chamada. Divida as linhas ainda não enriquecidas em lotes de 10.

3. **Fazer o bulk match em paralelo.** Inicie agentes em paralelo (4 por vez, igual ao carregador) e chame `apollo_people_bulk_match` para cada lote. Por linha na requisição, envie `linkedin_url: profileUrl` como chave primária, mais `name: fullName` como alternativa para o matcher do Apollo. Espere todas as chamadas terminarem.

4. **Mapear os resultados de volta para as linhas do Airtable.** O Apollo retorna um array por chamada na mesma ordem da requisição. Por resultado:
   - **E-mail verificado retornado** - defina `Email`, `Email Confidence: "verified"`, `Company`, `Title`, `Location`, `Apollo Contact URL`, `Enriched At`.
   - **E-mail estimado retornado** (o Apollo sinaliza matches de confiança mais baixa) - mesmos campos, mas `Email Confidence: "guessed"`. A skill `instantly-campaign`, mais adiante, descarta esses por padrão.
   - **Sem match** - defina apenas `Email Confidence: "no-match"`. Deixe `Email`, `Company`, `Title` vazios.

5. **Atualizar o Airtable em lotes.** Atualize 10 registros por chamada de `update records` (o limite real de lote do Airtable para atualização, diferente da criação). Inicie agentes de atualização em paralelo.

6. **Criar contatos no Apollo sob o rótulo.** Para cada linha que voltou com e-mail verificado ou estimado, chame `apollo_contacts_create` com o ID de pessoa do Apollo e o rótulo escolhido. O Apollo deduplica contatos por e-mail, então executar esse passo de novo com os mesmos dados é idempotente.

7. **Rebuscar as linhas enriquecidas.** Percorra a tabela de novo, colete as linhas com `Email Confidence: "verified"`. Salve-as em `runs/{runId}/contacts.json` no formato que a `instantly-campaign` espera:

   ```jsonc
   {
     "firstName": "Jane",
     "fullName": "Jane Doe",
     "email": "jane@northwind.example",
     "company": "Northwind",
     "title": "VP Operations",
     "linkedinUrl": "https://www.linkedin.com/in/janedoe",
     "personalizationFields": {
       "topRole": "VP Operations at Northwind",
       "topSchool": "Stanford",
       "topSkills": ["Operations", "Process Design"]
     }
   }
   ```

   `personalizationFields` só é preenchido para tabelas de origem de reações (onde o carregador escreveu `Top Role`, `Top School`, `Top Skills`). Para tabelas de origem de comentários esse objeto fica vazio.

8. **Atualizar o `leads.json`.** Para cada linha enriquecida, encontre o `profileUrl` correspondente em `leads.json` e defina `email`, `emailConfidence`, `company`, `title`, `location`, `enrichedAt`. Ler, mesclar e escrever de forma atômica.

9. **Adicionar ao `outputs.json`.** Uma linha: `{type: "enrichment", title: "Apollo enrichment - {tableName}", summary: "Matched {M} of {N} ({M/N}% match rate). {V} verified emails ready for outreach.", path: "runs/{runId}/contacts.json", status: "ready", domain: "enrichment"}`.

10. **Resumir para o usuário.** Um bloco:
    - Total de linhas processadas.
    - E-mails verificados encontrados (contagem + porcentagem).
    - E-mails estimados encontrados (contagem + porcentagem).
    - Contagem de sem match.
    - "E-mails verificados salvos para a próxima fase. E-mails estimados ficam no Airtable para sua revisão."

## Resultados

- Linhas do Airtable atualizadas com e-mail + empresa + cargo + localização + URL do Apollo + confiança.
- Novos contatos no Apollo sob o rótulo `LinkedIn {sourceType} - {sourceAuthor} Post`.
- `runs/{runId}/contacts.json` - contatos com e-mail verificado prontos para a `instantly-campaign`.
- `leads.json` - campos de enriquecimento preenchidos nos `profileUrl`s correspondentes.
- `outputs.json` - uma linha, `type: "enrichment"`, `domain: "enrichment"`.

## Falhas comuns

| Falha | Por quê | Correção |
|---|---|---|
| Taxa de match abaixo de 40% | Público muito voltado a consumidores, fora dos EUA, ou com cargos juniores (o banco de dados do Apollo é enviesado para empresas) | Normal para alguns públicos; siga em frente com o que você tem |
| Dados em cache sem e-mails na rebusca | A leitura do Airtable retornou um cache desatualizado | Espere 30 segundos e percorra de novo; se ainda estiver faltando, as escritas de atualização falharam silenciosamente, verifique erros de limite de taxa nas notas da execução |
| Limite de taxa do Apollo no bulk match | Muitos agentes em paralelo em um plano pequeno do Apollo | Reduza para 2 agentes em paralelo em vez de 4 |
| Apollo retorna 422 em `linkedin_url` | O formato da URL não corresponde ao que o Apollo espera (barra final, `/in/` vs `/pub/`) | Normalize para `https://www.linkedin.com/in/<slug>` antes de enviar; remova barras finais |

## O que eu nunca faço

- **Reenriquecer linhas que já têm um e-mail.** Verifico se `Email` está vazio antes de incluir uma linha nos lotes de bulk match. Economiza créditos do Apollo e evita sobrescrever dados bons.
- **Colocar e-mails estimados na campanha do Instantly.** E-mails estimados ficam no Airtable para sua revisão. Só e-mails verificados chegam ao `runs/{runId}/contacts.json`.
- **Enviar e-mails diretamente pelo Apollo.** Os endpoints de envio do Apollo existem, mas campanhas frias pertencem a um remetente dedicado (Instantly) para rastreamento de entregabilidade.
- **Fixar no código o formato do rótulo do Apollo ou o nome do endpoint de bulk match.** Tudo descoberto via Composio em tempo de execução.
