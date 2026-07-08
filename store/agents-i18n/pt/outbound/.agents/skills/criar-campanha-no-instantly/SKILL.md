---
name: criar-campanha-no-instantly
title: "Criar campanha no Instantly"
description: "Crio uma campanha de e-mail frio em pausa no Instantly, com todos os leads carregados e todas as contas de envio conectadas. Leio a sequência que você fechou comigo, limpo os corpos dos e-mails (o Instantly descarta corpos que contêm o caractere & literal, é um bug documentado), carrego até 1000 leads por chamada, e configuro o horário com um fuso horário que o Instantly aceita (America/Vancouver para o horário do Pacífico, que lida com o horário de verão automaticamente). Sempre fica em pausa para você revisar, nunca lanço automaticamente."
version: 1
category: Prospecção
featured: no
image: rocket
integrations: [instantly]
---


# Campanha no Instantly

Crio uma campanha de e-mail frio totalmente carregada e **pausada** no Instantly. Pego um arquivo de sequência travada mais um arquivo de contatos verificados, construo a campanha pela API REST do Instantly, contorno dois bugs conhecidos (restrições no enum de fuso horário e o bug que descarta o corpo por causa do "e" comercial), carrego todos os leads em uma única chamada, e anexo todas as contas de envio conectadas. A campanha sempre termina no status `paused`. Você aperta Ativar quando estiver pronto.

## Quando usar

- "Carregue essa sequência no Instantly: <arquivo de sequência>".
- "Crie a campanha no Instantly para essa lista".
- Fase 5 de qualquer um dos pipelines do LinkedIn.
- Você tem uma sequência travada e uma lista de contatos verificados e quer colocá-las para enviar.

## Quando NÃO usar

- A sequência ainda não está travada, termine a `cold-email-sequence` primeiro.
- A lista de contatos ainda não tem e-mails verificados, rode a `apollo-enrichment` primeiro.
- Você quer **editar** uma campanha existente, o painel do Instantly cuida disso. Eu crio campanhas novas; não altero as que já estão no ar.
- Você quer um envio de e-mail **quente** (pontual para uma pessoa específica), use Gmail ou Outlook diretamente, não uma plataforma de e-mail frio.

## Conexões de que preciso

- **Instantly** (plataforma de envio) - Obrigatório. Eu crio a campanha, carrego os leads, anexo as contas, configuro o horário.

Se o Instantly não estiver conectado, eu paro e peço para você conectar.

## Informações de que preciso

- **O arquivo da sequência travada** - Obrigatório. Caminho de um arquivo `.md` produzido pela `cold-email-sequence`. Se faltar, eu pergunto: "Onde está o arquivo da sequência travada? Deveria estar na sua pasta `sequences/`."
- **O arquivo de contatos verificados** - Obrigatório. Caminho do `contacts.json` produzido pela `apollo-enrichment`. Se faltar, eu pergunto: "Onde está o arquivo de contatos? Deveria estar em `runs/{runId}/contacts.json`."
- **Um nome para a campanha** - Opcional. O padrão é derivado do nome do arquivo da sequência (ex.: `2026-05-05-jane-doe-revops-sequence.md` vira `LinkedIn - Jane Doe RevOps`). Pode ser sobrescrito por chamada.
- **Contas de envio a anexar** - Opcional. O padrão é "todas as contas de envio conectadas no seu espaço de trabalho do Instantly". Pode ser sobrescrito por chamada se você quiser só algumas específicas.
- **Horário** - Opcional. Vem por padrão de `config/context-ledger.json` (padrão `America/Vancouver`, seg-sex, 8h-17h).

## Passos

1. **Ler as entradas.** Analise o arquivo da sequência em `{subject, body}` por e-mail. Leia o arquivo de contatos em uma lista de `{firstName, fullName, email, company, title, linkedinUrl, personalizationFields}`. Verifique que todo e-mail está preenchido e todo corpo está preenchido.

2. **Sanitizar os corpos.** **Remova todo caractere `&` de cada corpo de e-mail.** O armazenamento de corpo do Instantly descarta silenciosamente corpos que contêm um "e" comercial literal, a campanha é criada normalmente, mas o corpo sobe vazio e a sua campanha manda e-mails em branco. Substitua `&` por "e". Documente isso na descrição da campanha no Instantly para que você-do-futuro lembre por quê.

3. **Listar as contas de envio.** Chame o `list_accounts` do Instantly via Composio. Se o usuário nomeou contas específicas, filtre para essas. Se for "todas" (o padrão), mantenha todas.

4. **Escolher um horário.** Use o horário dos padrões de `config/context-ledger.json`. O campo de fuso horário é o mais fácil de errar, o enum de fuso horário do Instantly é restrito e não aceita todos os fusos `IANA`. Opções seguras:
   - **Pacífico**: `America/Vancouver` (lida com o horário de verão dos EUA no Pacífico automaticamente e está na lista aceita pelo Instantly).
   - **Leste**: `America/Toronto`.
   - **Europa Central**: `Europe/Berlin`.
   - Se o contexto tiver um fuso horário que o Instantly rejeita, use `America/Vancouver` como alternativa e registre a substituição nas notas da execução.

5. **Criar a campanha.** Faça um POST no endpoint `create_campaign` do Instantly com:
   - Nome = derivado (ou informado pelo usuário).
   - Etapas = 3, com defasagens de dia 0 / 3 / 7 correspondendo ao arquivo da sequência.
   - Corpos = sanitizados no passo 2.
   - Horário = escolhido no passo 4.
   - Status = `paused` (sempre, nunca `active`, mesmo que a API permita).

6. **Verificar que todos os corpos das etapas não estão vazios depois de criar.** Rebusque a nova campanha via `get_campaign` e confirme que o corpo de cada etapa não está vazio. Se alguma etapa estiver vazia, avise com destaque, o bug do "e" comercial te pegou apesar da sanitização, ou algum outro campo foi descartado. Não avance para o passo de carregamento.

7. **Carregar os leads em massa.** Faça um POST no `add_leads_to_campaign` do Instantly com os contatos verificados. O Instantly aceita até 1000 leads por chamada, se você tiver mais, pagine em lotes de 1000. Campos por lead:
   - `email` (obrigatório).
   - `first_name` (obrigatório para o campo de mesclagem `{{firstName}}`).
   - `last_name`.
   - `company`.
   - `title`.
   - `personalization` (opcional, só preenchido para contatos de origem de reações onde `personalizationFields` não está vazio).
   - `linkedin_url` (útil mas não obrigatório).

8. **Anexar as contas de envio.** Faça um POST no `attach_accounts_to_campaign` com as contas do passo 3. Anexar todas as contas conectadas é o padrão; o Instantly alterna os envios entre elas, o que melhora a entregabilidade em relação a uma única conta.

9. **Confirmar o status pausado.** Rebusque a campanha mais uma vez. Confirme `status: "paused"`. Se for qualquer coisa diferente de pausado, registre com destaque nas notas da execução e avise o usuário, o Instantly nunca deveria ativar automaticamente, mas se alguma configuração padrão escapou, o usuário precisa saber imediatamente.

10. **Adicionar ao `campaigns.json`.** Uma linha: `{name, instantlyCampaignId, sequenceFile, leadCount, sendingAccounts, schedule, status: "paused", createdAt}`.

11. **Atualizar o `leads.json`.** Para cada lead carregado, defina `loadedToCampaignId: instantlyCampaignId` na linha correspondente por `email`. Ler, mesclar e escrever de forma atômica.

12. **Adicionar ao `outputs.json`.** Uma linha: `{type: "campaign", title: "{Campaign name}", summary: "Campaign created in Instantly with {leadCount} leads, {accountCount} sending accounts. Status: PAUSED.", path: null, status: "paused", domain: "sending"}`. O `path: null` porque a campanha mora no Instantly, não em um arquivo.

13. **Resumo final para o usuário.**
    - Nome da campanha + status (pausada).
    - Leads carregados.
    - Contas de envio anexadas.
    - Horário (ex.: "seg-sex, 8h-17h no Pacífico via America/Vancouver, lida com o horário de verão automaticamente").
    - Link direto para a campanha no painel do Instantly.
    - "Revise no Instantly. Ative quando estiver pronto, eu não faço isso por você."

## Resultados

- Nova campanha no Instantly (pausada) com 3 etapas de e-mail, todos os leads carregados, todas as contas de envio anexadas.
- `campaigns.json` - uma linha.
- `leads.json` - `loadedToCampaignId` definido em todo lead carregado.
- `outputs.json` - uma linha, `type: "campaign"`, `status: "paused"`, `domain: "sending"`.

## Falhas comuns

| Falha | Por quê | Correção |
|---|---|---|
| Corpo vazio do lado do Instantly depois do upload | Um `&` literal estava no corpo do e-mail | O passo de sanitização remove isso; se escapou (ex.: dentro de uma URL), remova de novo e verifique com `get_campaign` |
| Fuso horário rejeitado pelo `create_campaign` | O enum de fuso horário do Instantly é restrito | Use `America/Vancouver` (Pacífico), `America/Toronto` (Leste), `Europe/Berlin` (Europa Central); evite `Etc/GMT*` |
| 401 no `add_leads_to_campaign` | Token do Instantly expirou no Composio | O usuário reconecta o Instantly na aba Integrações |
| Contagem de leads carregados menor que o esperado | O Instantly rejeitou duplicados silenciosamente (mesmo e-mail já em outra campanha) | Esse é o comportamento correto; mostre a diferença nas notas da execução para que o usuário veja quais leads foram ignorados e por quê |
| Campanha criada com `status: "active"` | Eu esqueci de definir `status: "paused"` na criação | Sempre defina explicitamente; nunca confie no padrão da API |

## O que eu nunca faço

- **Ativar a campanha.** Sempre fica pausada. O usuário aperta Ativar no painel do Instantly. Mesmo se o orquestrador passar uma sinalização pedindo ativação, eu recuso, isso é uma regra rígida, não um padrão.
- **Pular o passo de sanitização.** Os corpos sempre passam pela remoção do "e" comercial antes do upload, mesmo que o corpo pareça limpo.
- **Pular o passo de verificação.** Eu sempre rebusco a campanha depois de criar e depois de carregar para confirmar que os corpos não estão vazios e o status está pausado.
- **Alterar uma campanha existente que já está no ar.** Eu crio campanhas novas. Editar as que já estão no ar é trabalho do usuário no painel do Instantly.
- **Fixar no código os nomes dos endpoints de criação, carregamento ou verificação da campanha.** Tudo descoberto via Composio em tempo de execução.
