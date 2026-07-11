---
name: configurar-minhas-informacoes-de-marketing
title: "Configurar minhas informações de marketing"
description: "Me conte o básico sobre sua empresa, seu cliente e como você fala para eu poder te dar uma ajuda de marketing melhor. Faço algumas perguntas rápidas sobre seu produto, posicionamento, cliente ideal, voz e o que você está vendendo agora. Você só precisa fazer isso uma vez, e eu mantenho atualizado conforme as coisas mudam."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [googledocs, notion]
---


# Configurar minhas informações de marketing

Este skill cria ou atualiza seu documento de posicionamento. Todos os outros skills de marketing leem esse documento primeiro; se ele não existir, eles param e pedem para você criá-lo.

## Quando usar

- "me ajuda a escrever uma declaração de posicionamento" / "rascunha meu posicionamento" /
  "vamos fazer o posicionamento".
- "atualiza o documento de posicionamento" / "meu cliente ideal mudou, ajusta o documento
  de contexto".
- Chamado implicitamente por qualquer outro skill que precise de posicionamento, ao
  perceber que o documento está faltando, só depois de confirmar com você.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes deste skill rodar, verifico se as categorias abaixo estão conectadas. Se estiver faltando, eu nomeio a categoria, peço para você conectar na aba Integrações e paro.

- **Google Docs ou Notion** - espelhar o documento de posicionamento em algum lugar que você possa compartilhar com conselheiros e uma futura contratação. Opcional, o documento local é a fonte da verdade.
- **Anotações de reunião (Gong, Fireflies, Circleback)** - puxar a linguagem literal do cliente para o documento não soar como "marketês". Opcional, mas a entrada de maior alavancagem.
- **Caixa de entrada (Gmail, Outlook)** - amostrar sua voz. Opcional.

Posso rodar este skill sem nenhuma conexão, só vou me apoiar mais no que você colar.

## Informações que eu preciso

Eu leio seu contexto de marketing primeiro. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **O básico da sua empresa** - Obrigatório. Por que eu preciso: o documento abre com o que você faz e para quem. Se estiver faltando, eu pergunto: "Qual é o nome da sua empresa, seu site, e como você descreveria o que você faz em uma frase?"
- **Seu cliente ideal** - Obrigatório. Por que eu preciso: posicionamento sem um leitor alvo é só adjetivos. Se estiver faltando, eu pergunto: "Quem é o cliente que você está tentando conquistar, cargo, tamanho da empresa, o que faz ele procurar uma solução?"
- **Sua voz** - Obrigatório. Por que eu preciso: o documento carrega regras de voz que todos os outros skills leem. Se estiver faltando, eu pergunto: "Conecta sua caixa de saída para eu poder amostrar sua voz, ou cola duas ou três coisas que você escreveu."
- **Duas ou três citações literais de clientes** - Obrigatório. Por que eu preciso: eu não vou parafrasear clientes em "marketês". Se estiver faltando, eu pergunto: "Solta a gravação de uma ligação de vendas recente, cola duas ou três frases de clientes que você lembra palavra por palavra, ou conecta Gong / Fireflies para eu poder puxar elas."
- **Uma ou duas contas âncora** - Opcional. Se estiver faltando, eu pergunto: "Nomeia um ou dois clientes reais, ou clientes alvo, que você apontaria como o encaixe perfeito. Se você não tiver isso, eu sigo com TBD."

## Passos

1. **Ler configuração.** Carregar `config/company.json`, `config/ideal-customer.json`,
   `config/voice.md`. Se algum estiver faltando, rodar `onboard-me` primeiro (ou
   perguntar UMA peça faltante na hora certa com dica de melhor modalidade:
   app conectado > arquivo > URL > colar).

2. **Ler o documento existente, se houver.** Se
   `context/marketing-context.md` existir, ler para que esta execução seja uma atualização,
   não uma reescrita. Preservar o que o fundador já refinou; mudar
   só o que estiver desatualizado ou for novo.

3. **Insistir em linguagem literal de clientes.** Antes de rascunhar, pedir ao
   fundador 2-3 citações literais de clientes (dor que nomearam, frase
   usada sobre a categoria, objeção ouvida). Se `call-insights/` tiver
   entradas, garimpar essas primeiro. Nenhuma paráfrase de "marketês",
   contestar se o fundador começar a "traduzir" as palavras do cliente.

4. **Rascunhar o documento (~300-500 palavras, opinativo, direto).** Estrutura,
   em ordem:

   1. **Visão geral da empresa** - um parágrafo: o que fazemos, para quem,
      o que torna isso digno de ser construído agora.
   2. **Cliente ideal** - setor, tamanho, cargo, gatilhos. Nomear **1-2 contas
      âncora** (reais, já fechadas ou alvo).
   3. **Jobs-to-be-done** - 2-3 tarefas reais para as quais o comprador contrata o produto.
      Linguagem literal do cliente é preferível.
   4. **Declaração de posicionamento** - categoria + público + valor
      diferenciado em uma frase. Opinativo.
   5. **Categoria e diferenciais** - categoria em que atuamos + 3
      coisas que realmente nos diferenciam (não "somos mais rápidos").
   6. **Top 3 concorrentes** - nomeados, uma linha "eles são fortes em X,
      nós somos fortes em Y" para cada um.
   7. **Notas de voz da marca** - 4-6 bullets sobre tom, frases
      proibidas, preferência de comprimento de frase. Puxar de
      `config/voice.md`.
   8. **Postura de preço** - modelo + faixa atual + uma coisa que NÃO é
      negociável.
   9. **CTA principal** - uma ação para a qual toda página / email / campanha
      empurra agora.

5. **Marcar lacunas com honestidade.** Se uma seção estiver rasa (sem citações
   de cliente ainda, sem conta âncora), escrever `TBD - {o que o fundador deveria
   trazer a seguir}` em vez de adivinhar. Nunca inventar.

6. **Escrever de forma atômica.** Escrever em
   `context/marketing-context.md.tmp`, depois renomear para
   `context/marketing-context.md`. Arquivo único na raiz do agente. NÃO
   dentro de uma subpasta. NÃO dentro de `.agents/`. NÃO dentro de
   `.houston/<agent>/`.

7. **Adicionar a `outputs.json`.** Ler o array existente, adicionar uma nova
   entrada, escrever de forma atômica:

   ```json
   {
     "id": "<uuid v4>",
     "type": "positioning",
     "title": "Positioning doc updated",
     "summary": "<2-3 frases - a declaração de posicionamento + o que mudou nesta passada>",
     "path": "context/marketing-context.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

   (O documento em si é um arquivo vivo, mas cada edição substantiva é indexada
   para o fundador ver a atualização no painel.)

8. **Resumir para você.** Um parágrafo: o que mudou, o que ainda está
   `TBD`, o próximo passo exato (ex.: "cola 3 citações de clientes e eu vou
   apurar o JTBD"). Lembrar você de que os outros quatro agentes agora têm o contexto
   de que precisam.

## Saídas

- `context/marketing-context.md` (na raiz do agente - documento vivo)
- Adiciona a `outputs.json` com `type: "positioning"`.
