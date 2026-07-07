---
name: escrever-sequencia-de-e-mails-frios
title: "Escrever sequência de e-mails frios"
description: "Escrevo com você uma sequência de 3 e-mails de prospecção fria, um e-mail de cada vez, seguindo o método de James Shields: assunto personalizado (não o corpo), 3 frases mais um PS, uma oferta irresistível e uma chamada para ação de baixa fricção para responder. Fecho cada e-mail com você antes de passar para o próximo, para que o tom, a prova social e a oferta permaneçam consistentes. É a fase 4 dos dois pipelines, e também pode ser executada de forma independente se você já tiver uma lista de contatos verificados e quiser textos novos."
version: 1
category: Prospecção
featured: yes
image: pencil
integrations: []
---


# Sequência de E-mails Frios

Escrevo com você uma sequência de 3 e-mails de prospecção fria, um e-mail de cada vez. A sequência segue o método de James Shields: assunto baseado em um gatilho, corpo de três frases, oferta irresistível sem contrapartida, e uma chamada para ação de resposta em uma palavra. Apresento cada rascunho, refino com você, e travo antes de passar para o próximo, assim o tom, a prova social e a oferta permanecem consistentes.

> **Método de James Shields** - um manual de prospecção amplamente usado que rejeita a chamada para ação de "agende uma demo" em favor de assuntos baseados em gatilhos, corpos de três frases, ofertas gratuitas sem contrapartida, e chamadas para ação de resposta em uma palavra. Otimizado para taxa de resposta, não para volume de impressões.

## Quando usar

- "Escreva uma sequência de e-mails frios para esses contatos".
- "Rascunhe uma prospecção de 3 e-mails para {público}".
- Fase 4 de qualquer um dos pipelines do LinkedIn.
- Você tem uma lista de contatos verificados (do Apollo, Clay, Hunter, ou de qualquer outro lugar) e quer textos novos.
- Você quer renovar uma copy de e-mail frio cansada com um método comprovado.

## Quando NÃO usar

- **Leads quentes** que já te conhecem, use um e-mail único e direto, não uma sequência fria de 3 etapas.
- **Ciclo de vida, onboarding ou nutrição** para usuários existentes, isso é outro movimento (e mora no agente de Marketing).
- **Transacionais** (recibos, redefinições de senha, notificações).
- **Follow-up pós-chamada**, use a `write-my-outreach` do agente de Vendas com `stage=followup`.
- **Newsletters ou e-mails de conteúdo**, use as skills de conteúdo do agente de Marketing.

## Conexões de que preciso

- **Nenhuma.** Essa skill escreve localmente e produz um arquivo de sequência. As conexões voltam a entrar em jogo na `instantly-campaign` (a próxima fase).

## Informações de que preciso

Reúno as entradas no passo 1 abaixo. O mínimo:

- **Gatilho/origem** - o que conecta você a esses leads (a publicação no LinkedIn, o evento, a notícia).
- **Produto** - descrição em uma linha do que você vende.
- **Prova social** - pelo menos um case com **números reais** (nada de "melhoria de 10x" sem dizer quem e como). De preferência 3 ou mais para que cada e-mail tenha uma prova nova.
- **Oferta** - a coisa gratuita ou de baixa fricção que você está dando (diagnóstico, auditoria, teste grátis, vaga gratuita).
- **CTA de resposta** - a resposta em uma palavra que você quer (padrão "Topo").
- **Remetente** - só o seu primeiro nome.
- **Rascunho existente** - opcional, qualquer texto do qual você queira que eu parta.

Se faltar gatilho, produto, prova social ou oferta, eu peço isso na hora antes de rascunhar.

## O método

### Regra 1: Personalize o assunto, não o corpo
- O assunto faz referência ao gatilho (publicação, evento, comentário).
- O corpo usa só `{{firstName}}`.
- Evite `{{company}}` `{{title}}` etc. no corpo, a taxa de resposta cai quando os campos de mesclagem parecem óbvios.

### Regra 2: Três frases mais PS (só no E-mail 1)
- F1: contexto/gatilho (por que você está mandando o e-mail).
- F2: o que você construiu/a oferta.
- F3: prova social (números específicos).
- PS: saída suave para que a pessoa possa se desengajar sem ignorar.

### Regra 3: Oferta irresistível
- Acesso gratuito, sem contrapartida.
- "Eu só quero um feedback honesto".
- Nenhuma demo, nenhuma chamada, nenhum compromisso na etapa fria.

### Regra 4: Chamada para ação de baixa fricção
- Responda com uma palavra: "Topo".
- NÃO "agende uma chamada" ou "marque uma demo".

### Regra 5: Sem enrolação
- Sem travessão (use pontos finais).
- Sem "espero que esteja tudo bem com você".
- Sem tópicos ou formatação no corpo.
- Assunto em letra minúscula.
- Escreva como se estivesse mandando mensagem para um colega.

## Passos

### Passo 1: Reunir as entradas

Pergunte uma vez, registre nas notas da execução. Se algo já estiver em `config/context-ledger.json` (remetente, tom de voz, banco de prova social), use sem perguntar de novo. Confirme o gatilho e a oferta, já que isso muda por campanha.

### Passo 2: E-mail 1, o abridor (Dia 0)

Rascunhe seguindo este modelo:

```
Assunto: <personalizado ao gatilho, minúsculo, casual, 2-4 palavras>

Oi {{firstName}},

<1 frase: eu vi o seu <gatilho>. Validação breve.>

<1-2 frases: o que eu construí. Concreto.>

<1-2 frases: prova social. Números específicos.>

<1 frase: a oferta. Grátis, sem contrapartida.>

Responda "<cta>" e eu <ação>.

<primeiro nome do remetente>

PS <saída suave, ex.: "Se isso não é o seu problema agora, é só responder 'agora não' que eu não insisto.">
```

**Apresente ao usuário. Refine até aprovar. NÃO avance até travar.**

### Passo 3: E-mail 2, o follow-up (Dia 3)

Rascunhe seguindo este modelo:

```
Assunto: (mesma conversa, em branco)

Oi {{firstName}},

<1 frase: follow-up. Reconheça a caixa de entrada cheia.>

<2 frases: prova social NOVA. Cliente diferente, números diferentes do E-mail 1.>

<1 frase: reafirme a oferta.>

Responda "<cta>" e eu <ação>.

<primeiro nome do remetente>
```

Mais curto que o E-mail 1 (sem PS). Prova social NOVA, nunca repita do E-mail 1.

**Apresente ao usuário. Refine até aprovar. NÃO avance até travar.**

### Passo 4: E-mail 3, o de despedida (Dia 7)

Rascunhe seguindo este modelo:

```
Assunto: (mesma conversa, em branco)

Oi {{firstName}},

Esse é o último que eu mando sobre isso.

<1 frase: a ferramenta está no ar. Outras pessoas usando.>

<1 frase: CTA final, se quiser a sua, responda "<cta>" hoje.>

Não mando mais e-mail depois desse.

<primeiro nome do remetente>
```

Máximo 4 frases. "Não mando mais e-mail" cria urgência. Nenhuma nova oferta.

**Apresente ao usuário. Refine até aprovar.**

### Passo 5: Salvar a sequência travada

Escreva em `sequences/{runId}-sequence.md` se chamado por um orquestrador (o orquestrador passa `runId`); caso contrário `sequences/{YYYY-MM-DD}-{campaign-slug}-sequence.md`.

Formato do arquivo:

```markdown
# {Nome da campanha}

Travada em {data ISO}. Remetente: {primeiro nome}. Público-alvo: {descrição curta}.

## E-mail 1 (Dia 0)

Assunto: <assunto>

<corpo>

## E-mail 2 (Dia 3)

Assunto: (mesma conversa)

<corpo>

## E-mail 3 (Dia 7)

Assunto: (mesma conversa)

<corpo>

## Notas de envio

- Cronograma: seg-sex, 8h-17h em {fuso horário do contexto, padrão America/Vancouver}.
- Contas de envio: {do contexto, padrão "todas as conectadas"}.
- Meta de quantidade de leads: {do arquivo de contatos, ex. "92 leads verificados"}.
```

### Passo 6: Adicionar aos resultados

Linha de `outputs.json`: `{type: "sequence", title: "{Campaign name} sequence", summary: "3-email locked sequence ready for Instantly load.", path: "sequences/{file}", status: "locked", domain: "sequence"}`.

### Passo 7: Resumo final para o usuário

Uma linha: "Sequência travada em {caminho}. Pronta para carregar no Instantly quando você quiser."

## Resultados

- `sequences/{runId}-sequence.md` - sequência travada de 3 e-mails pronta para a `instantly-campaign`.
- `outputs.json` - uma linha, `type: "sequence"`, `status: "locked"`, `domain: "sequence"`.

## Referência rápida

| E-mail | Dia | Tamanho | Assunto | Objetivo |
|-------|-----|--------|---------|------|
| 1 Abridor | 0 | 3 frases + PS | Personalizado ao gatilho, minúsculo | Gancho + oferta + prova |
| 2 Follow-up | 3 | 3-4 frases | Em branco (mesma conversa) | Prova social NOVA, reafirma a oferta |
| 3 Despedida | 7 | 4 frases NO MÁXIMO | Em branco (mesma conversa) | Urgência, "não mando mais e-mail" |

## Erros comuns

| Erro | Por que ele mata a sequência | Correção |
|---|---|---|
| Assuntos longos (6+ palavras, em caixa alta de título) | Parece marketing, não uma pessoa | Minúsculo, 2-4 palavras, referenciando o gatilho |
| Múltiplos CTAs em um e-mail | Divide a atenção, reduz a taxa de resposta | Um CTA por e-mail, sempre a mesma palavra de resposta |
| Repetir prova social entre e-mails | Desperdiça o segundo contato | O E-mail 2 precisa usar um cliente NOVO e números NOVOS |
| "Só passando para saber" / "trazendo isso de volta" | Soa como preenchimento desesperado | Reconheça a caixa cheia uma vez, depois entregue valor novo |
| Links de agendamento no E-mail 1 | A fricção mata as respostas frias | Só CTA de resposta, links vêm depois que a pessoa disser "Topo" |
| Quebrar a regra das 3 frases | E-mails longos são só passados por cima e descartados | Corte até cada frase ser essencial |
| Travessão, pontos de exclamação, tópicos | Parece gerado por IA ou marketeiro | Texto simples, só pontos finais, escreva como uma mensagem de texto |

## O que eu nunca faço

- **Escrever os 3 e-mails antes de te mostrar algum.** Cada e-mail é travado com você antes de eu rascunhar o próximo. Isso pega o desvio de tom cedo.
- **Reutilizar prova social entre e-mails.** O E-mail 2 precisa usar um cliente diferente e números diferentes do E-mail 1. Se você só me deu um ponto de prova social, eu paro e peço outro antes de rascunhar o E-mail 2.
- **Usar travessão, pontos de exclamação ou formatação que denuncia IA no corpo.** A skill `instantly-campaign` também remove os "e" comerciais (&) no momento do carregamento (bug do Instantly), mas o corpo não deveria conter esses caracteres vindos de mim, para começar.
- **Adicionar pixels de rastreamento ou encurtadores de link no corpo.** A entregabilidade de e-mail frio é frágil; a plataforma de envio cuida do rastreamento, o corpo fica simples.
- **Escrever um Assunto para o E-mail 2 ou 3.** Manter a conversa (assunto em branco) é intencional e é o que sinaliza para a caixa de entrada da pessoa agrupá-los no mesmo tópico.
