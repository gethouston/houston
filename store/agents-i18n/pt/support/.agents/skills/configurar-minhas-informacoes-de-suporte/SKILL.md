---
name: configurar-minhas-informacoes-de-suporte
title: "Configurar minhas informações de suporte"
description: "Me conte o básico sobre seu produto, seus clientes, e como você lida com o suporte, para que eu possa te ajudar melhor. Faço algumas perguntas rápidas sobre seu produto, metas de tempo de resposta, lista VIP, regras de roteamento, e as pegadinhas conhecidas. Você só precisa fazer isso uma vez, e eu mantenho tudo atualizado conforme as coisas mudam."
version: 1
category: Suporte
featured: yes
image: headphone
integrations: [googledocs, stripe, notion, github, linear]
---


# Configurar minhas informações de suporte

Dona de `context/support-context.md`. É a única skill que cria ou atualiza o documento completo (a seção de roteamento também é editável por `tune-my-routing`). Toda outra skill lê esse documento antes de trabalhar, até ele existir, elas param e pedem que você me rode primeiro.

## Quando usar

- "configure nosso contexto de suporte" / "defina nosso contexto de suporte" / "vamos fazer o documento de contexto".
- "atualize o documento de contexto" / "um novo nível / VIP / pegadinha, corrija o contexto".
- Chamada implicitamente por qualquer outra skill que precise de contexto e encontre o documento faltando, mas só depois de confirmar com você.

## Conexões de que preciso

Eu executo trabalho externo pelo Composio. Antes de rodar esta skill, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu nomeio a categoria, peço para você conectá-la na aba de Integrações e paro.

- **Docs / notas** (Google Docs / Notion), puxar posicionamento ou documentos de produto existentes para semear o rascunho. Opcional.
- **Cobrança** (Stripe), ler os níveis de plano ao vivo se você preferir que eu os deduza em vez de perguntar. Opcional.
- **Rastreador de dev** (GitHub / Linear), destino nomeado para a regra de roteamento de bugs. Opcional.

Se nenhuma dessas estiver conectada, eu sigo em frente, esta skill é essencialmente uma entrevista, as conexões só a aceleram.

## Informações de que preciso

Eu leio seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Básico da empresa**, Obrigatório. Por que preciso disso: ancora a visão geral do produto no topo do documento. Se faltar, eu pergunto: "O que o produto faz em uma frase, e quem compra?"
- **Segmentos de clientes + lista VIP**, Obrigatório. Por que preciso disso: VIPs recebem prioridade P1 independentemente do conteúdo; os segmentos moldam cada resposta. Se faltar, eu pergunto: "Quem são seus 5 maiores clientes agora, e existem segmentos (SMB / mid-market / enterprise) que eu deva tratar de forma diferente?"
- **Metas de tempo de resposta**, Obrigatório. Por que preciso disso: expectativas de tempo de resposta por nível. Se faltar, eu pergunto: "Que tempo de resposta você quer atingir para seus tickets mais urgentes, e o que é aceitável para o resto?"
- **Categorias de roteamento**, Obrigatório. Por que preciso disso: a triagem e a detecção de sinais mapeiam cada mensagem recebida para uma delas. Se faltar, eu pergunto: "Quando um ticket chega, em quais baldes você o separa, bug, dúvida de uso, cobrança, algo mais?"
- **Níveis de escalonamento**, Obrigatório. Por que preciso disso: definições de P1 / P2 / P3 / P4 para a triagem. Se faltar, eu pergunto: "O que torna algo um incêndio versus algo para o mesmo dia versus algo para esta semana?"
- **Amostras literais de voz**, Opcional. Por que preciso disso: a seção de tom soa mais verdadeira com frases reais. Se você não tiver, eu sigo com TBD e recomendo rodar a calibração de voz.

1. **Ler `config/context-ledger.json`.** Preciso de `universal.company`, `universal.idealCustomer`, `domains.inbox.responseTimeTargets`, `domains.inbox.routingCategories`, `domains.quality.escalationTiers`. Para qualquer campo faltando, faço UMA pergunta direcionada com dica de modalidade (app conectado > arquivo > URL > colar), escrevo atomicamente, continuo.

2. **Ler o documento existente se houver.** Se `context/support-context.md` existir, leio para que a execução seja uma atualização e não uma reescrita. Preservo tudo o que já foi refinado; mudo apenas o que está desatualizado ou é novo.

3. **Insistir em linguagem literal.** Antes de rascunhar, peço a você 2–3 frases literais de clientes ou tickets de exemplo, palavras de fricção, pegadinhas recorrentes. Se `voice-samples/` tiver entradas, minero primeiro.

4. **Rascunhar o documento (~400–700 palavras, opinativo, direto).** Estrutura, nesta ordem:

   1. **Visão geral do produto**, um parágrafo: o que o produto é, para quem, principais áreas (funcionalidades/fluxos), modelo de preços, self-serve versus vendas assistidas.
   2. **Segmentos de clientes + lista VIP**, segmentos nomeados + contas VIP. VIPs recebem P1 independentemente do conteúdo.
   3. **Tom + voz**, tom padrão (direto / caloroso / humano), 3–5 amostras literais de `voice-samples/` se houver (senão `TBD  -  run calibrate-my-voice`), frases proibidas.
   4. **Níveis de tempo de resposta**, definições de P1 / P2 / P3 / P4 + expectativas de tempo de resposta por nível. Nomear o que qualifica cada nível.
   5. **Regras de roteamento**, árvore de decisão:
      - Bug → destino no rastreador (Linear / GitHub, da configuração ou pergunto); informações a capturar (reprodução, versão, cliente).
      - Pedido de funcionalidade → `requests.json`, com atribuição ao cliente.
      - Indisponibilidade → referência ao playbook (`playbooks/p1-outage.md` quando rascunhado).
      - Cobrança → dossiê do Stripe + aprovador de reembolso (fundador por padrão).
   6. **Pegadinhas conhecidas**, lista curta de peculiaridades do produto respondidas 10+ vezes. 3–10 bullets.

5. **Marcar lacunas com honestidade.** Se uma seção estiver rala, escrevo `TBD  -  {o que você deve trazer da próxima vez}`. Nunca invento.

6. **Escrever atomicamente.** Escrevo em `context/support-context.md.tmp`, renomeio para `context/support-context.md`. Um único arquivo sob `context/`, NÃO sob `.agents/` ou `.houston/` (o watcher os ignora).

7. **Adicionar a `outputs.json`.** Leio o array existente, adiciono uma nova entrada (`type: "support-context"`, `domain: "quality"`, título resumindo a mudança), escrevo atomicamente.

8. **Resumir para mim.** Um parágrafo: o que escrevi, o que ainda está `TBD`, próximo passo ("próximo: rode `calibrate-my-voice`" / "próximo: me diga qual rastreador você usa para bugs"). Lembrar que toda outra skill agora opera com base nesse documento.

## Saídas

- `context/support-context.md` (na raiz do agente, documento vivo)
- Adiciona a `outputs.json` com `type: "context-edit"`.
