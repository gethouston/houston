---
name: escrever-uma-proposta
title: "Escrever uma proposta"
description: "Redijo uma proposta de uma página fundamentada no negócio: o problema deles nas próprias palavras, sua abordagem proposta, o escopo (o que entra e o que não entra), o preço dentro da postura do seu playbook, os termos, as métricas de sucesso, o cronograma e o próximo passo. Qualquer coisa fora dos seus inegociáveis de preço é sinalizada para sua aprovação, nunca é comprometida em silêncio."
version: 1
category: Vendas
featured: no
image: handshake
---


# Escrever Uma Proposta

Proposta de uma página. Não é um SOW, é um documento enxuto de uma página que o campeão encaminha para o comprador econômico e para compras.

## Quando usar

- "redigir uma proposta para {Acme}".
- "proposta de uma página para {Acme}".
- "preciso mandar uma cotação / escopo para {Acme}".

## Conexões de que preciso

Eu rodo trabalho externo pelo Composio. Antes desta skill rodar, verifico se as categorias abaixo estão conectadas. Faltando, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **CRM** - ler o registro do negócio (responsável, estágio, valor, contatos). Opcional, mas recomendado.
- **Reuniões** - puxar transcrições de calls anteriores para extrair declarações literais do problema e métricas de sucesso. Opcional.

Se nenhum dos dois estiver conectado, sigo em frente com suas anotações existentes e peço os fatos do negócio que estiverem faltando.

## Informações de que preciso

Leio seu contexto de vendas primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Seu playbook de vendas** - Obrigatório. Por que preciso: faixas de preço, política de desconto e termos mínimos viáveis precisam vir da sua postura, não de um palpite. Se faltando, pergunto: "Eu ainda não tenho seu playbook, quer que eu redija ele agora?"
- **Para qual negócio é esta proposta** - Obrigatório. Por que preciso: extraio a declaração literal do problema e a métrica de sucesso do histórico de calls daquele negócio. Se faltando, pergunto: "Para qual prospect ou negócio é esta proposta?"
- **A declaração literal do problema deles e a métrica de sucesso** - Obrigatório. Por que preciso: uma página de uma folha só funciona quando o problema está nas palavras deles. Se estiver faltando nas anotações de call, pergunto: "Como o prospect descreveu o problema com as próprias palavras, e qual métrica vai mostrar para eles que funcionou?"
- **Premissas de preço (número de usuários, prazo, volume)** - Obrigatório. Por que preciso: preciso mostrar a conta, não inventar. Se faltando, pergunto: "O que estamos propondo, quantos assentos ou qual volume, qual duração de contrato?"

1. **Ler o playbook.** Carregar `context/sales-context.md`. Obrigatório. Sem ele, parar.

2. **Ler os preços.** Da seção de postura de preços do playbook. Conhecer faixas, política de desconto, inegociável. **Nunca redigir abaixo do inegociável.** Se o negócio precisar disso, escrever DESCONHECIDO + sinalizar para aprovação.

3. **Ler o histórico do negócio** - todas as anotações de call + análises em `calls/` filtradas por `dealSlug`. Extrair: declaração do problema (literal), métrica de sucesso (literal), stakeholders, cronograma.

4. **Redigir a proposta (~300-450 palavras):**

   1. **Declaração do problema** - nas palavras DELES, citando qual call.
   2. **Abordagem proposta** - um parágrafo, concreto. Sem jargão vazio.
   3. **Escopo** - o que entra: em tópicos. O que fica explicitamente FORA: em tópicos. A lista do que fica fora é tão importante quanto a do que entra, evita escopo crescente.
   4. **Preço** - faixa proposta, premissas (número de usuários, volume, prazo), qualquer desconto aplicado (dentro da política). Mostrar a conta.
   5. **Termos** - termos mínimos viáveis do playbook, ajustados só dentro da política de desconto.
   6. **Métricas de sucesso** - como os dois lados saberão que funcionou. Puxadas das anotações de call, a métrica que eles disseram que importava.
   7. **Cronograma** - kickoff, marcos de valor-em-{N}-semanas.
   8. **Próximo passo** - quem assina, quem faz revisão jurídica, data alvo de fechamento (de `close-plan.md` se existir).

5. **Checar contra o playbook.** Qualquer compromisso fora da postura de preços ou dos termos é sinalizado embutido com `FLAG: precisa de aprovação - excede {inegociável}`. Aparece no resumo para você, nunca escondido.

6. **Versionamento.** Se já existir uma proposta anterior, incrementar a versão. Primeiro rascunho = `proposal-v1.md`; próximo = `v2.md`. Nunca sobrescrever.

7. **Escrever de forma atômica** em `deals/{slug}/proposal-v{N}.md.tmp` → renomear.

8. **Atualizar `deals.json`** - definir `lastProposalAt`, `proposalVersion`.

9. **Adicionar ao `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "proposal",
     "title": "Proposta v{N} - {Company}",
     "summary": "<escopo em uma linha + faixa de preço>",
     "path": "deals/{slug}/proposal-v{N}.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

10. **Resumir.** O pedido de preço + as sinalizações que precisam da sua decisão. Caminho para a proposta completa. Nunca enviar.

## Saídas

- `deals/{slug}/proposal-v{N}.md`
- Atualiza `deals.json`.
- Adiciona ao `outputs.json`.
