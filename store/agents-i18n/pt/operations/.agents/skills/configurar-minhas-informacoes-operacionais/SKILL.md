---
name: configurar-minhas-informacoes-operacionais
title: "Configurar minhas informações operacionais"
description: "Me conte como sua empresa realmente funciona para que as outras habilidades operacionais parem de fazer as mesmas perguntas. Eu registro suas prioridades do trimestre, seu ritmo operacional, seus contatos principais, sua postura com fornecedores, seus limites inegociáveis e sua voz, tudo em um único documento vivo. Você faz isso apenas uma vez e eu mantenho atualizado conforme as coisas mudam."
version: 1
category: Operações
featured: yes
image: clipboard
---


# Configurar minhas informações operacionais

Este agente É DONO de `context/operations-context.md`. Nenhum outro agente escreve nele. Esta habilidade cria ou atualiza esse documento. A existência dele desbloqueia este agente.

## Quando usar

- "configure nosso contexto operacional" / "redija o documento operacional" / "documente como trabalhamos".
- "atualize o contexto operacional" / "as prioridades mudaram, corrija o documento".
- Chamado implicitamente por outra habilidade que precisa do documento de contexto e descobre que ele está faltando, só depois de confirmar com o usuário.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, eu verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Caixa de entrada** (Gmail, Outlook) - Opcional. Permite que eu amostre mensagens enviadas para a seção de voz refletir como você realmente escreve.
- **Calendário** (Google Calendar, Outlook) - Opcional. Me ajuda a inferir seu ritmo operacional (dias de trabalho focado, densidade de reuniões).
- **Arquivos** (Google Drive) - Opcional. Se você me indicar um documento operacional existente, eu leio antes de redigir.

Esta habilidade funciona sem nenhuma conexão, as conexões só deixam o documento mais completo. Eu nunca bloqueio aqui.

## Informações que eu preciso

Eu leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > arquivo enviado > URL > colar) e espero.

- **Retrato da empresa** - Obrigatório. Por que eu preciso: toda outra habilidade se apoia no que você faz, para quem é e seu estágio. Se estiver faltando, eu pergunto: "Em uma ou duas frases, o que a empresa faz e para quem é? E onde vocês estão hoje, pré-lançamento, primeiros usuários, escalando?"
- **Prioridades ativas** - Obrigatório. Por que eu preciso: toda revisão semanal e fluxo de aprovação depende delas. Se estiver faltando, eu pergunto: "Quais são as 2 a 3 coisas que a empresa está priorizando neste trimestre?"
- **Ritmo operacional** - Obrigatório. Por que eu preciso: molda a entrega de resumos, a proteção do trabalho focado, a carga de reuniões. Se estiver faltando, eu pergunto: "Como você gosta de trabalhar, dias de trabalho focado, dias de reunião, máximo de reuniões por dia, fuso horário?"
- **Contatos principais** - Obrigatório. Por que eu preciso: ancora o roteamento de VIPs e "quem desbloqueia o quê". Se estiver faltando, eu pergunto: "Quem são seus contatos principais, investidor líder, advisor mais próximo, clientes âncora, jurídico ou financeiro fracionado?"
- **Postura com fornecedores** - Obrigatório. Por que eu preciso: guia o tom para renovações e compras. Se estiver faltando, eu pergunto: "Como você lida com fornecedores, conservador, equilibrado, ou avançar rápido? Quem pode assinar? Anual ou mensal?"
- **Limites inegociáveis** - Opcional. Por que eu preciso: me impede de redigir coisas que você nunca enviaria. Se você não tiver isso, eu sigo em frente com dado pendente usando os padrões do workspace.

## Passos

1. **Leio a configuração.** Carrego `config/company.json`, `config/rhythm.json`, `config/voice.md`. Se algum estiver faltando, rodo `onboard-me` primeiro (ou peço UMA peça faltante bem na hora, com a melhor dica de modalidade: app conectado > arquivo > URL > colar).

2. **Leio o documento existente, se houver.** Se `context/operations-context.md` existir, leio para que a execução seja uma atualização, não uma reescrita. Preservo o que o fundador já aprimorou; mudo só o que está desatualizado ou é novo.

3. **Peço as peças que a configuração não cobre.** Antes de redigir, pergunto ao fundador de forma concisa:
   - **Contatos principais** - nomes + função + como contatar para: investidor líder, advisor mais próximo, 1 a 2 clientes âncora, jurídico/financeiro fracionado, contratado de operações (se houver).
   - **Postura com fornecedores** - apetite a risco (conservador / equilibrado / rápido), autoridade de assinatura (só o fundador / qualquer executivo), preferência de prazo (mensal / anual / caso a caso), preferência de papel (nosso / deles / tanto faz).
   - **Limites inegociáveis** - qualquer coisa específica do fundador além dos quatro do workspace (nunca mover dinheiro, nunca modificar HRIS/folha de pagamento, nunca decidir compras sozinho, nunca enviar nada externo sem aprovação).
   - **Ferramentas conectadas** (por categoria do Composio, não marca) - caixa de entrada, calendário, chat de equipe, drive, gravação de reuniões, CRM (se houver), faturamento (se houver), pesquisa na web, notícias, redes sociais.

   Se a seção estiver rasa, marco `TBD - {o que o fundador deveria trazer a seguir}` e sigo em frente. Nunca invento.

4. **Redijo o documento (cerca de 300 a 500 palavras, opinativo, direto).** Estrutura, em ordem:

   1. **Visão geral da empresa** - um parágrafo: o que fazemos, para quem, estágio, por que agora.
   2. **Prioridades ativas** - 2 a 3 coisas movendo a empresa neste trimestre. A rubrica do fluxo de aprovação + a revisão semanal dependem delas.
   3. **Ritmo operacional** - dias de trabalho focado, dias de reunião, cadência de revisão, dias sem reunião, fuso horário.
   4. **Contatos principais** - nomes, funções, como contatar. Organizado por categoria (investidores, advisors, clientes âncora, contratados, jurídico).
   5. **Ferramentas e sistemas** - categorias do Composio conectadas + onde os dados vivem (drive principal, CRM, ferramenta de projetos, chat, faturamento).
   6. **Fornecedores e postura de gastos** - apetite a risco, autoridade de assinatura, preferências de prazo, preferências de papel.
   7. **Limites inegociáveis** - os quatro do workspace + os específicos do fundador.
   8. **Voz de comunicação** - 4 a 6 tópicos sobre tom, frases proibidas, preferência de tamanho de frase. Extraído de `config/voice.md`.

5. **Escrevo de forma atômica.** Escrevo em `context/operations-context.md.tmp`, depois renomeio para `context/operations-context.md`. Arquivo único na raiz do agente. NÃO em subpasta. NÃO em `.agents/`. NÃO em `.houston/<agente>/`.

6. **NÃO adiciono a `outputs.json`.** O documento é vivo, não é entregável, não é indexado.

7. **Resumo para o usuário.** Um parágrafo: o que foi registrado, o que ainda está `TBD`, o próximo passo exato (ex.: "me envie sua lista de advisors e eu aprimoro os Contatos Principais"). Lembro que o agente de Operações de Fornecedores e Compras agora tem contexto para rodar.

## Saídas

- `context/operations-context.md` (na raiz do agente, documento vivo)

(Sem entrada em `outputs.json`, por design.)
