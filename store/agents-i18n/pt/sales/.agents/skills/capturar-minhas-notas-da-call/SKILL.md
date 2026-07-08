---
name: capturar-minhas-notas-da-call
title: "Capturar minhas notas da call"
description: "Transformo uma transcrição ou gravação em notas estruturadas: a pauta real versus a planejada, os participantes, as dores nas palavras deles, as decisões, os itens de ação divididos entre internos e externos, e o próximo passo. Relaciono a call com o lead certo, atualizo o dossiê dele, e só sincronizo com seu CRM com sua aprovação."
version: 1
category: Vendas
featured: no
image: handshake
integrations: [gong, fireflies]
---


# Capturar Minhas Notas Da Call

Transformo a transcrição bruta em notas estruturadas, pesquisáveis e prontas para o CRM.

## Quando usar

- Você: "processe minha call com a Acme" / cola uma transcrição / solta
  um arquivo `.txt` ou `.vtt` / "capture as notas da reunião de ontem".
- Chamado por uma rotina que puxa de um app de notas de reunião conectado
  (Fathom, Fireflies, Grain, Circleback, etc., descoberto via
  `composio search meeting-notes`).

## Conexões que eu preciso

Eu executo trabalho externo pelo Composio. Antes desta skill rodar eu verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Reuniões** - puxar a transcrição quando você apontar para uma reunião. Obrigatório a menos que você cole ou solte o arquivo.
- **CRM** - criar ou atualizar um registro de reunião/atividade no contato do lead. Opcional.
- **Ferramentas de tarefas** - registrar uma entrada de notas no seu app de documentos/notas. Opcional.

Se nenhuma das categorias obrigatórias estiver conectada e você não colou nem soltou um arquivo, eu paro e peço para você conectar o Gong ou o Fireflies, ou compartilhar a transcrição diretamente.

## Informações que eu preciso

Eu leio seu contexto de vendas primeiro. Para cada campo obrigatório que estiver faltando eu faço UMA pergunta em linguagem simples (melhor formato: app conectado > arquivo > URL > texto colado) e espero.

- **A transcrição ou gravação** - Obrigatório. Por que eu preciso: extraio dores, decisões e itens de ação do que foi realmente dito. Se estiver faltando eu pergunto: "Solte a gravação, cole a transcrição, ou me diga qual reunião pegar no Gong/Fireflies."
- **A qual lead ou negócio essa call pertence** - Obrigatório. Por que eu preciso: relaciono as notas com o lead certo e atualizo o dossiê dele. Se estiver faltando eu pergunto: "Com qual prospect ou cliente foi essa call?"
- **Se devo enviar as notas para seu CRM** - Opcional. Por que eu preciso: só sincronizo com sua aprovação. Se você não tiver preferência, eu sigo em frente com PENDENTE e pergunto antes de qualquer sincronização externa.

1. **Fonte da transcrição.** Se colada, uso ela. Se for um arquivo,
   leio ele. Se você apontar para um provedor conectado, rodo
   `composio search` para achar a ferramenta de listagem/busca, encontro a
   reunião mais recente que combina com sua descrição, puxo a transcrição.
2. **Identificar a reunião.** Extraio data/horário, participantes (separando
   internos de externos), duração, título da reunião se disponível.
3. **Relacionar com o lead.** Procuro o(s) participante(s) externo(s) em
   `leads.json` por nome + empresa. Se não encontrar, crio uma linha de lead
   mínima a partir da transcrição, marco `source: "meeting-first-contact"`.
4. **Atribuir id.** `call_id = kebab(data-nome-externo-principal)`.
5. **Extrair notas estruturadas:**
   - **Pauta real** - o que realmente foi discutido (não o que a pauta
     dizia).
   - **Dores levantadas** - frases específicas nas palavras deles, com
     citação da transcrição.
   - **Objeções levantadas** - preço, prazo, autoridade, encaixe, citadas.
   - **Decisões** - tudo que foi acordado durante a call.
   - **Itens de ação** - responsável + o que + até quando. Divididos entre
     internos e externos.
   - **Próximo passo** - o único próximo contato agendado (se acordado)
     ou "próximo passo pendente."
6. **Escrever estruturado:** `calls/{call_id}/notes.json` com o schema
   completo + `calls/{call_id}/notes.md` como resumo legível para humanos.
7. **Atualizar o dossiê do lead.** Adiciono em
   `leads/{slug}/lead.json` → `recentCalls: [...]` (id + data +
   resumo de uma linha). Atualizo `lastContactedAt`, `status` (provavelmente
   "meeting-held" ou "follow-up-owed").
8. **Adicionar ao índice `calls.json`** com id, data, slug do lead, participantes,
   resumo do próximo passo.
9. **Sincronização com o CRM (se conectado).** Rodo `composio search crm`. Se
   conectado, crio ou atualizo um registro de reunião/atividade no contato do
   lead no CRM. Incluo participantes + data + itens de ação + próximo passo.
   Nunca sincronizo a transcrição literal a menos que você opte explicitamente
   por isso (geralmente fora do escopo dos campos de notas do CRM).
10. **Sincronização com o app de notas (se conectado).** Se você conectou
    um app de notas/documentos E `config/notes-sync.json` diz para enviar,
    crio uma nota lá. Caso contrário, pulo em silêncio.
11. **Resumir para você:** "Capturado. 3 dores, 2 itens de ação
    (1 seu: {X}, 1 deles: {Y}), próximo passo: {Z}. CRM sincronizado."

## Nunca invento

Se um campo não estiver claramente presente na transcrição, escrevo "não informado",
nunca preencho dores ou responsáveis que soem plausíveis. O custo posterior
de notas de call inventadas é alto.

## Saídas

- `calls/{call_id}/notes.json` (estruturado)
- `calls/{call_id}/notes.md` (legível para humanos)
- Atualiza `leads/{slug}/lead.json` e `leads.json`
- Atualiza o índice `calls.json`
- Opcional: criação ou atualização de atividade no CRM
- Opcional: entrada no app de notas
