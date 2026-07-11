---
name: tracar-o-perfil-do-meu-comprador
title: "Traçar o perfil do meu comprador"
description: "Construo um perfil certeiro de quem realmente compra em um segmento: champion, comprador econômico, bloqueador, desqualificadores, contas âncora. Parto da sua lista de ganhos no CRM ou trabalho com os exemplos que você me der. Todo e-mail frio, preparação de call e proposta que eu redijo parte daqui."
version: 1
category: Vendas
featured: no
image: handshake
integrations: [hubspot, salesforce, attio, pipedrive]
---


# Traçar O Perfil Do Meu Comprador

Skill mais específica que uma persona de marketing. Objetivo: responder "para quem vendemos, quem assina, quem bloqueia, o que dispara a decisão", as 4 coisas que o agente e o vendedor precisam para ajustar outreach e discovery.

## Quando usar

- "traça o perfil do comitê de compra de {segment}".
- "quem assina em {segment}" / "quem realmente compra de nós".
- "monta uma persona de vendas para {segment}".
- Chamada por `set-up-my-sales-info` quando a seção do comitê de compra está escassa.

## Conexões que preciso

Faço o trabalho externo através do Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectá-la na aba Integrações, e paro.

- **CRM**  -  busco as principais contas fechadas com sucesso no segmento (dados firmográficos, contatos, tempo até o fechamento). Obrigatório, a menos que você prefira que eu trabalhe com exemplos que você me der.
- **Redes sociais**  -  enriqueço os perfis do champion e do comprador econômico via LinkedIn. Opcional.

Se o seu CRM não estiver conectado, ofereço trabalhar com 2 ou 3 exemplos de negócios fechados que você descrever diretamente.

## Informações que preciso

Primeiro leio o seu contexto de vendas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > arquivo > URL > colar) e espero.

- **Seu playbook de vendas**  -  Obrigatório. Por que preciso: a persona refina a seção do comitê de compra que está lá. Se estiver faltando, pergunto: "Ainda não tenho o seu playbook. Quer que eu rascunhe um primeiro?"
- **O segmento a traçar o perfil**  -  Obrigatório. Por que preciso: a persona é específica de um segmento, não genérica. Se estiver faltando, pergunto: "De qual segmento eu devo traçar o perfil? Setor, tamanho da empresa, geografia?"
- **Fonte das contas**  -  Obrigatório. Por que preciso: ou busco no seu CRM, ou trabalho com exemplos que você me der. Se estiver faltando, pergunto: "Devo buscar negócios fechados com sucesso nesse segmento no seu CRM conectado, ou você prefere me apresentar 2 ou 3 contas reais?"
- **Quem assinou e quem bloqueou em negócios anteriores**  -  Opcional. Por que preciso: refina os padrões do comprador econômico e do bloqueador. Se você não tiver essa informação, sigo com TBD na seção do bloqueador.

1. **Leio o playbook.** Carrego `context/sales-context.md`. Se estiver faltando, rodo `set-up-my-sales-info` primeiro.

2. **Defino a fonte das contas.** Pergunto ao usuário: "Devo buscar
   contas fechadas com sucesso em {segment} no seu CRM conectado, ou
   trabalhar com exemplos que você me der?" Rota do CRM:
   `composio search crm` → busco as ~20 principais contas fechadas
   com sucesso no segmento. Rota de exemplos: peço 2 a 3 contas
   reais fechadas (ou contas-alvo de melhor encaixe).

3. **Extraio por conta.** Para cada conta: dados firmográficos
   (tamanho, região, setor, estágio), cargo e motivações do
   champion, quem assinou o contrato, quem resistiu ou atrasou, o
   que disparou a busca, tempo até o fechamento, caso de uso
   principal. Cito a fonte (registro do CRM ou descrição do
   fundador).

4. **Sintetizo entre as contas.** Escrevo:
   - **Champion**  -  padrões de cargo, dores citadas, motivações, o que ele ganha quando o negócio fecha.
   - **Comprador econômico**  -  padrões de cargo (muitas vezes diferente do champion), o que o convence (retorno sobre o investimento, mitigação de risco, ruptura do status quo, paridade competitiva), o que faz ele matar negócios.
   - **Bloqueador**  -  a cadeira que mais frequentemente mata negócios em {segment} (geralmente TI, jurídico, compras, ou o champion do fornecedor incumbente). Como neutralizar.
   - **Influenciadores**  -  outras cadeiras que precisam estar alinhadas no processo.
   - **Desqualificadores**  -  3 "nãos" definitivos específicos para {segment} (se diferentes do playbook global).
   - **Gatilhos de compra**  -  sinais concretos de que estão começando a busca agora (padrão de contratação, captação, mudança de stack, incidente, prazo regulatório).

5. **Sinalizo lacunas com honestidade.** `TBD  -  preciso de mais 2 contas fechadas com sucesso no segmento`, em vez de chutar.

6. **Escrevo de forma atômica.** Escrevo em `personas/{segment-slug}.md.tmp`, depois renomeio. Cito cada afirmação.

7. **Adiciono a `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "persona",
     "title": "Comitê de compra  -  {segment}",
     "summary": "<2-3 frases  -  padrão de champion / comprador econômico / bloqueador>",
     "path": "personas/{segment-slug}.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

8. **Resumo para o usuário.** Um parágrafo e o caminho. Sinalizo quais seções do playbook a persona atualiza (comitê de compra, desqualificadores, gatilhos) e se recomendo rodar `set-up-my-sales-info` em seguida para incorporar.

## Saídas

- `personas/{segment-slug}.md`
- Adiciona a `outputs.json` com `type: "persona"`.
