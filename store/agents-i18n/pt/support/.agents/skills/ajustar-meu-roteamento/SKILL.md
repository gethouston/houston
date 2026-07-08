---
name: ajustar-meu-roteamento
title: "Ajustar meu roteamento"
description: "Atualizo as regras que decidem como os tickets recebidos são classificados e para onde vão. Mudo o que conta como bug versus pedido de funcionalidade, redireciono bugs para um novo sistema de rastreamento, atualizo quem aprova reembolsos, adiciono uma nova categoria, ou ajusto o roteamento VIP. Toda triagem depois da atualização segue automaticamente as novas regras."
version: 1
category: Suporte
featured: no
image: headphone
integrations: [googledocs, stripe, notion, github, linear]
---


# Ajustar meu roteamento

## Quando usar

- "atualiza nosso roteamento" / "conserta o roteamento" / "o que é bug e o que é pedido de funcionalidade."
- "migramos para o {tracker}" / "reembolsos agora vão para {pessoa}" / "adiciona uma nova faixa."
- Quando `review-my-support scope=weekly` aponta desvio de classificação.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes de rodar esta skill, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu digo qual é a categoria, peço para você conectá-la na aba de Integrações, e paro.

- **Rastreador de desenvolvimento** (GitHub / Linear), destino nomeado da regra de roteamento de bugs. Obrigatório se o roteamento de bugs encadeia em um rastreador.
- **Cobrança** (Stripe), destino nomeado do roteamento de cobrança. Opcional.
- **Docs / notas** (Notion / Google Docs), destino nomeado do roteamento de KB ou de status. Opcional.

Se você quer que bugs fluam para um rastreador, eu paro e peço para você conectar aquele que você realmente usa.

## Informações que eu preciso

Eu leio o seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor forma: app conectado > envio de arquivo > URL > colar) e aguardo.

- **Categorias de roteamento atuais**. Obrigatório. Por que preciso: reescrevo a partir das suas regras existentes, não do zero. Se faltar, pergunto: "Em quais categorias você separa os tickets hoje, bug, passo a passo, cobrança, algo mais?"
- **O que está mudando**. Obrigatório. Por que preciso: não vou reescrever a seção inteira se você só queria atualizar uma regra. Se faltar, pergunto: "Que parte do roteamento você quer mudar, o rastreador, as categorias, quem aprova reembolsos, outra coisa?"
- **Aprovador de reembolsos**. Opcional. Por que preciso: a regra de cobrança nomeia uma pessoa real. Se você não tiver, eu sigo em frente com TBD e deixo como "fundador aprova."

## Passos

1. **Ler `context/support-context.md`.** Se não existir, rode `set-up-my-support-info` primeiro.

2. **Mostrar as regras atuais para você.** Leio a seção de regras de roteamento e resumo em 3–4 linhas ("hoje: bug → Linear, pedido de funcionalidade → `requests.json`, indisponibilidade → `playbooks/p1-outage.md`, cobrança → Stripe + você aprova reembolsos"). Pergunto: o que está mudando?

3. **Capturar a atualização.** Faço UMA pergunta focada por vez, sem entrevista completa. Atualizações típicas:
   - Novo rastreador de destino (migração do Linear para GitHub Issues, etc.).
   - Nova classificação (por exemplo, adicionar "relato de segurança").
   - Novo contato de escalonamento.
   - Mudança de aprovador de reembolsos.
   - Adições à lista de VIPs (também pertencem à seção de segmentos, atualizo as duas se necessário).

4. **Reescrever a seção de regras de roteamento de forma limpa.** Preservo o formato de árvore de decisão. Para cada tipo, indico:
   - Frases / padrões de gatilho que qualificam.
   - Local de destino (slug do rastreador, caminho do playbook, dossiê, chat).
   - Qual skill atua (`triage-a-ticket`, `flag-a-signal`, `draft-a-playbook`, etc.).
   - Quais dados capturar.

5. **Também atualizar seções relacionadas** se a mudança implicar nisso, lista de VIPs (seção de segmentos), faixas de tempo de resposta, entradas de pegadinhas conhecidas que referenciam o rastreador alterado. Sou explícito sobre o que mais foi tocado.

6. **Escrever atomicamente** (`.tmp` → rename).

7. **Adicionar ao `outputs.json`** com `type: "routing-rules"`, `domain: "quality"`, título "Regras de roteamento atualizadas: {motivo curto}", resumo de 2 frases sobre o que mudou, caminho `context/support-context.md`, status `draft`.

8. **Explicar o efeito para você.** Encerro o resumo com: "Toda execução de `triage-a-ticket` e `flag-a-signal` depois disso lê as novas regras, sem ressincronização manual."

## Saídas

- `context/support-context.md` (roteamento + possivelmente seções relacionadas atualizadas)
- Adiciona ao `outputs.json` com `type: "routing-rules"`, `domain: "quality"`.
