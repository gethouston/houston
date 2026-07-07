---
name: escrever-um-plano-de-fechamento
title: "Escrever um plano de fechamento"
description: "Construo um plano de ação mútuo com o prospect: uma linha do tempo compartilhada que cobre compras, revisão de segurança, aprovação de orçamento e jurídico, com responsáveis (os seus e os deles) e marcos com data. Aponto explicitamente os três principais riscos e qualquer stakeholder desconhecido para você saber o que descobrir na próxima call."
version: 1
category: Vendas
featured: no
image: handshake
---


# Escrever Um Plano De Fechamento

Plano de ação mútuo (MAP). Compartilhado com o campeão. Gera responsabilidade dos dois lados. Versão honesta, se o comprador econômico é desconhecido, escrever UNKNOWN, não "tomador de decisão".

## Quando usar

- "criar um plano de ação mútuo com {Acme}".
- "plano de fechamento para {Acme}".
- "o que falta para fechar {Acme}".

## Conexões de que preciso

Eu rodo trabalho externo pelo Composio. Antes desta skill rodar, verifico se as categorias abaixo estão conectadas. Faltando, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **CRM** - ler o registro do negócio (responsável, estágio, valor, data de fechamento). Opcional, mas fortemente recomendado.

Se seu CRM não estiver conectado, sigo em frente só com suas anotações de call e peço para você colar quaisquer fatos do negócio que estejam faltando.

## Informações de que preciso

Leio seu contexto de vendas primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Seu playbook de vendas** - Obrigatório. Por que preciso: os estágios de negócios e a qualificação definem o que ainda está em aberto no plano. Se faltando, pergunto: "Eu ainda não tenho seu playbook, quer que eu redija ele agora?"
- **Para qual negócio é este plano** - Obrigatório. Por que preciso: leio o histórico de calls daquele negócio específico. Se faltando, pergunto: "Para qual prospect ou negócio devo criar este plano de fechamento?"
- **Data alvo de fechamento** - Opcional. Por que preciso: ancora a linha do tempo. Se você não tiver isso, proponho uma com base no seu ciclo de fechamento típico e sinalizo como TBD.
- **Nomes do campeão, comprador econômico e bloqueador** - Opcional. Por que preciso: eles se tornam as linhas do plano. Se você não tiver isso, escrevo UNKNOWN e sinalizo cada um como algo a descobrir na próxima call.

1. **Ler o playbook.** Carregar `context/sales-context.md`. Preciso dos estágios de negócios + qualificação para saber o que ainda está em aberto.

2. **Ler o histórico de calls do negócio.** Todos os `calls/{id}/analysis.md` onde `dealSlug` corresponde. Extrair fatos confirmados versus inferidos.

3. **Compilar o estado atual:**

   - **Campeão** - nome + cargo, ou UNKNOWN.
   - **Comprador econômico** - nome + cargo, ou UNKNOWN.
   - **Bloqueador** - se identificado, nome. Senão, UNKNOWN.
   - **Caminho de compras** - revisão jurídica? Questionário de segurança da informação? Aprovação financeira? Se desconhecido, UNKNOWN.
   - **Orçamento** - confirmado / previsto / precisa de aprovação / UNKNOWN.
   - **Validação técnica** - feita / agendada / necessária / N/A.
   - **Data alvo de fechamento** - do usuário se fornecida, senão proponho com base no ciclo de fechamento típico do playbook.

4. **Redigir o plano como uma linha do tempo compartilhada** - nossa e deles:

   ```
   Semana -4 : [nós] Enviar proposta v2 | [eles] Campeão se alinha com o CE
   Semana -3 : [eles] Revisão jurídica / Segurança da informação | [nós] Call de validação técnica
   Semana -2 : [eles] Aprovação de compras | [nós] Redlines do contrato
   Semana -1 : [eles] Aprovação executiva | [nós] Estado final pronto para kickoff
   Semana  0 : [ambos] Contrato assinado, kickoff agendado
   ```

   Cada linha: responsável (nós / eles / ambos), ação, data alvo, bloqueio (se houver).

5. **Sinalizar os UNKNOWNs com destaque.** Cada UNKNOWN ganha um marcador na seção "O que precisamos descobrir", cada um atribuído à próxima call com uma pergunta específica.

6. **Escrever de forma atômica** em `deals/{slug}/close-plan.md.tmp` → renomear. Um plano de fechamento por negócio, sobrescreve versões anteriores (mas mantém um changelog curto no rodapé: "v2 - 2026-04-23: fechamento adiado -1 semana por causa da revisão jurídica").

7. **Atualizar `deals.json`** - definir `closePlanAt`, `risk` (recalcular GREEN/YELLOW/RED com base nos UNKNOWNs + atrasos de data).

8. **Adicionar ao `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "close-plan",
     "title": "Plano de fechamento - {Company}",
     "summary": "Fechamento alvo {date} · {N} UNKNOWNs · {N} passos.",
     "path": "deals/{slug}/close-plan.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

9. **Resumir.** Data alvo de fechamento + principal UNKNOWN que você deveria resolver a seguir. Sugerir `prep-a-meeting type=call` para o próximo contato.

## Saídas

- `deals/{slug}/close-plan.md`
- Atualiza `deals.json`.
- Adiciona ao `outputs.json`.
