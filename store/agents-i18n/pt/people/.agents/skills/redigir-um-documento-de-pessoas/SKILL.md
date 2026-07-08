---
name: redigir-um-documento-de-pessoas
title: "Redigir um documento de pessoas"
description: "Redijo um documento de pessoas para você, como uma carta de oferta, um plano de onboarding, um plano de melhoria de desempenho (PIP) ou um roteiro para uma conversa de retenção. Redijo com base nas suas faixas salariais, na sua voz, no seu framework de níveis e nos seus limites inegociáveis, para que pareça que você mesmo escreveu. São apenas rascunhos, você é quem envia cada um."
version: 1
category: Pessoas
featured: yes
image: busts-in-silhouette
integrations: [googledocs, notion, loops, gmail, slack]
---


# Redigir um documento de pessoas

Uma habilidade para todo primeiro rascunho de documento de pessoas de que o fundador precisa. O parâmetro `type` escolhe o modelo + estrutura + verificações. A disciplina "só rascunhos, nunca enviado / agendado / entregue" é compartilhada.

## Parâmetro: `type`

- `offer-letter` - carta de oferta para uma nova contratação em um nível específico, ancorada nas faixas salariais + posição de equity.
- `onboarding-plan` - plano do Dia 0, Semana 1, 30-60-90, além da mensagem de boas-vindas no Slack + e-mail de boas-vindas na sua voz.
- `pip` - plano de melhoria de desempenho. Verificação de escalonamento obrigatória primeiro. Se um gatilho de classe protegida + tempo suspeito disparar, PARO e escrevo uma nota de escalonamento em vez disso.
- `stay-conversation` - ROTEIRO verbal para uma reunião individual, não um e-mail. Cinco seções: Abrir → Escutar → Trazer à tona → Perguntar → Propor. Filtrado conforme os limites inegociáveis.

O usuário nomeia o `type` em linguagem simples ("redija uma oferta para {candidate}", "planeje o onboarding de {new hire}", "redija um PIP para {employee}", "roteirize a conversa de retenção") → eu deduzo. Se for ambíguo, faço UMA pergunta nomeando as quatro opções.

## Quando usar

- `type=offer-letter` - "redija uma oferta para {candidate}", "escreva a carta de oferta", "carta de oferta para {candidate} no nível {level}". Pré-requisito: registro do candidato + resumo do processo existirem, fundador ter decidido seguir em frente.
- `type=onboarding-plan` - "redija o plano de onboarding para {new hire}", "primeiros 90 dias para {new hire}", "{new hire} começa em {date}, deixa ele pronto", "checklist da primeira manhã para {new hire}", "mensagem de boas-vindas do Dia 0 no Slack para {new hire}". Implícito: encaminhado depois de `draft-a-people-document type=offer-letter` → oferta aceita.
- `type=pip` - "redija um PIP para {employee}", "plano de melhoria de desempenho para {employee}", "{manager} sinalizou {employee} por preocupações de desempenho". Sempre disparado por você, nunca implicitamente.
- `type=stay-conversation` - "redija uma conversa de retenção para {employee}", "{employee} pode estar de saída", "alguém foi sinalizado como VERMELHO, o que eu digo", "preparação para conversa de retenção".

## Conexões de que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma → eu nomeio a categoria, peço para você conectá-la na aba Integrações, e paro.

- **Documentos (Google Docs, Notion)** - escrever a carta de oferta ou o plano de onboarding onde você quer enviá-lo. Opcional. (`offer-letter`, `onboarding-plan`)
- **Caixa de entrada (Gmail, Outlook, Loops)** - analisar sua voz anterior em ofertas / desempenho / notícias difíceis, se eu ainda não tiver feito isso. Opcional, todos os tipos. A leitura da voz fica mais precisa com uma conexão.
- **Chat (Slack)** - redigir a mensagem de boas-vindas no Slack no tom certo do canal; ler conversas recentes de reuniões individuais, se você guarda notas ali. Opcional. (`onboarding-plan`, `pip`, `stay-conversation`)
- **Plataforma de RH (Gusto, Deel, Rippling, Justworks)** - buscar data de início, cargo, gestor, localização para `onboarding-plan`; confirmar cargo / nível / tempo de casa / gestor para `pip` / `stay-conversation`. Opcional.

Esta habilidade nunca envia, agenda ou entrega nada, então nenhuma integração é estritamente obrigatória.

## Informações de que preciso

Leio primeiro o seu contexto de pessoas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

**Todos os tipos:**

- **Contexto de pessoas** - Obrigatório. Por que preciso: níveis, voz, limites inegociáveis, regras de escalonamento. Se faltar, digo para você rodar primeiro a habilidade configurar-minhas-informacoes-de-pessoas.
- **Exemplos de voz** - Opcional para `offer-letter` / `onboarding-plan`, Obrigatório para `pip` / `stay-conversation`. Por que preciso: rascunhos sensíveis ao tom no registro errado soam mais duros ou mais suaves do que você pretende. Se faltar, pergunto: "Conecte sua caixa de entrada para eu analisar duas ou três mensagens anteriores, ou cole uma."

**`type=offer-letter`:**

- **Registro do candidato e resumo do processo** - Obrigatório. Por que preciso: eu redijo com base no histórico e na decisão de contratação. Se faltar, pergunto: "Não tenho um resumo registrado para esse candidato. Você já decidiu fazer a oferta?"
- **Faixas salariais** - Obrigatório. Por que preciso: todo número precisa vir de uma faixa ou de uma exceção registrada por escrito. Se faltar, pergunto: "Qual é a faixa salarial para esse nível, faixa de salário-base mais faixa de equity, e algum ajuste por localização?"
- **Posição sobre equity** - Obrigatório. Por que preciso: vesting, cliff e tipo de concessão não podem ser adivinhados. Se faltar, pergunto: "Qual é a nossa concessão de equity padrão, tipo, cronograma de vesting e cliff?"
- **Termos da oferta** - Obrigatório. Por que preciso: trava os detalhes específicos da oferta. Se faltar, pergunto: "Confirme o nível, o salário-base, o equity, a data de início e a localização dessa oferta."

**`type=onboarding-plan`:**

- **Dados principais da nova contratação** - Obrigatório. Por que preciso: toda seção do plano depende disso. Se faltar, pergunto: "Me diga o nome, o cargo, o nível, o gestor, a data de início, e se a pessoa é remota ou presencial."
- **Framework de níveis** - Obrigatório. Por que preciso: os marcos de 30 / 60 / 90 dias mapeiam para o padrão desse nível. Se faltar, pergunto: "Como você descreveria o que é 'atingir o padrão' nesse nível ao longo dos primeiros 90 dias?"
- **Canal de boas-vindas** - Opcional. Padrão: canal geral da equipe + A DEFINIR.
- **Atribuição de padrinho/madrinha** - Opcional. Padrão: A DEFINIR.

**`type=pip`:**

- **Identidade do funcionário** - Obrigatório. Por que preciso: eu não redijo um PIP para alguém que eu não consigo identificar com clareza. Se faltar, pergunto: "Qual funcionário, nome completo, cargo, e há quanto tempo está na empresa?"
- **Framework de níveis e limites inegociáveis** - Obrigatório. Por que preciso: as expectativas do PIP mapeiam para o seu padrão e para os seus limites inegociáveis. Se faltar, pergunto: "Como você descreveria o padrão nesse nível, e quais alavancas estão fora de cogitação?"
- **Regras de escalonamento** - Obrigatório. Por que preciso: eu rodo uma verificação de classe protegida e de tempo suspeito antes de qualquer rascunho. Se faltar, pergunto: "Para quem vão as preocupações de discriminação, assédio e retaliação. Existe um advogado indicado, ou devemos marcar como A DEFINIR até você ter um?"
- **Preocupações recentes e cronologia** - Obrigatório. Por que preciso: a janela de tempo é essencial para a verificação de escalonamento. Se faltar, pergunto: "Quando as preocupações de desempenho surgiram pela primeira vez, e o funcionário fez algum pedido protegido, como licença, acomodação, reclamação, ou comunicou uma gravidez, nos últimos 90 dias?"

**`type=stay-conversation`:**

- **Identidade do funcionário** - Obrigatório. Se faltar, pergunto: "Qual funcionário, nome completo, cargo, e há quanto tempo está na empresa?"

## Passos

1. **Ler o documento de contexto de pessoas** em `context/people-context.md`. Se estiver ausente/vazio: "Primeiro preciso do seu contexto de pessoas, rode a habilidade configurar-minhas-informacoes-de-pessoas." Paro. Busco o framework de níveis, as faixas salariais, a posição sobre equity, as notas de voz, os limites inegociáveis, as regras de escalonamento. Essencial para todo tipo.
2. **Leio o registro** + preencho lacunas com UMA pergunta objetiva por campo obrigatório que faltar, conforme a seção Informações do tipo em questão.
3. **Leio a configuração**: `config/voice.md` para o tom de voz de contratação/desempenho (saudação/despedida, comprimento das frases). Se faltar → faço UMA pergunta objetiva nomeando a melhor modalidade ("Conecte sua caixa de entrada via Composio para eu analisar 2 a 3 ofertas / mensagens de notícias difíceis anteriores, ou cole uma"). Escrevo voice.md, sigo em frente.
4. **Ramifico conforme `type`.**

   - **Se `type = offer-letter`:**
     1. **Leio o contexto do candidato.** Abro `interview-loops/{candidate-slug}.md` para o resumo do processo e o sinal de nível/escopo acordado. Abro `candidates/{candidate-slug}.md` para o histórico. Se nenhum dos dois existir, digo ao usuário para rodar `debrief-an-interview-loop` primeiro. Paro.
     2. **Confirmo os termos da oferta com o fundador.** UMA pergunta se algo faltar: "Confirme, nível: {X}, salário-base: {Y}, equity: {Z}, data de início: {D}. Quer alterar algum desses valores? (Nota: {Y} e {Z} vieram da faixa salarial {band-name} em context/people-context.md.)" Se o fundador ultrapassar a faixa, exijo uma justificativa explícita por escrito. Registro no rodapé da carta de oferta.
     3. **Redijo a carta de oferta.** Estrutura:
        - Saudação (com a voz combinada conforme `config/voice.md` + notas de voz do contexto de pessoas).
        - Cargo, título, nível, linha de reporte.
        - Salário-base (da faixa salarial).
        - Equity, tamanho da concessão, cronograma de vesting, cliff, tipo (ISO/NSO/RSU se indicado na posição sobre equity).
        - Data de início + designação de localização/remoto.
        - Referência a benefícios ("conforme o nosso cânone de políticas de benefícios, context/people-context.md").
        - Condições (verificação de antecedentes, verificação de referências, autorização para trabalhar, assinatura de acordo de PI/confidencialidade).
        - Prazo para aceitar.
        - Assinatura (com a voz combinada).
     4. **Verificação de tom.** Releio o rascunho em relação às notas de voz. Se o tom estiver fora do esperado (muito corporativo, muito casual, despedida errada), reviso antes de escrever.
     5. **Escrevo em `offers/{candidate-slug}.md`** de forma atômica (`*.tmp` → renomear). Arquivo com cabeçalho de metadados: `{ level, base, equity, start, location, band, overrideReason? }` mais o corpo completo da carta.

   - **Se `type = onboarding-plan`:**
     1. **Leio o contexto da plataforma de RH** se conectada (somente leitura, o agente nunca altera registros de RH). Busco data de início, cargo, gestor, localização, remoto/presencial. Se os dados principais da contratação faltarem, faço UMA pergunta objetiva cobrindo todas as lacunas (melhor modalidade: registro na plataforma de RH > carta de oferta colada > colar).
     2. **Descubro as ferramentas via Composio** conforme necessário: `composio search hris`, `composio search chat`, `composio search inbox`, `composio search calendar`. Se faltar uma categoria, digo qual conectar na aba Integrações e sigo com o resto.
     3. **Componho o plano** com estas seções:
        - **Preparação do Dia 0** - contas a provisionar (e-mail, Slack, ferramentas por cargo), equipamentos a enviar + rastreamento, atribuição de padrinho/madrinha, blocos de agenda para a Semana 1, fila de mensagens de boas-vindas.
        - **Semana 1** - conteúdo do pacote de boas-vindas, reuniões de apresentação (fundador, equipe, times transversais), tour pelas ferramentas, documentos de leitura, primeiras tarefas de acompanhamento.
        - **Marcos do Dia 30** - entregas + roteiro de check-in, tirados das expectativas do framework de níveis para esse nível/trilha.
        - **Marcos do Dia 60** - entregas ampliadas + primeira responsabilidade individual.
        - **Marcos do Dia 90** - responsabilidade completa + primeiro ponto de referência de avaliação.
     4. **Redijo a mensagem de boas-vindas no Slack + o e-mail de boas-vindas.** Leio as notas de voz de `context/people-context.md` (e `config/voice.md`, se existir). Combino com a impressão digital de tom. Incluo apresentação do padrinho/madrinha, link da agenda do Dia 1, uma linha "veja o que importa na sua primeira semana."
     5. **Escrevo** o plano de forma atômica em `onboarding-plans/{new-hire-slug}.md` (`*.tmp` → renomear). Incluo a mensagem de boas-vindas no Slack + o e-mail de boas-vindas no final, em seções claramente identificadas, para o fundador copiar diretamente.

   - **Se `type = pip`, rodo a verificação de escalonamento primeiro:**
     1. Leio a seção de regras de escalonamento de `context/people-context.md`. Anoto todo gatilho listado. Conjunto canônico: classe protegida (raça, gênero, idade 40+, gravidez, deficiência, religião, origem nacional, orientação sexual, condição de veterano, confirmo a lista da jurisdição no documento de contexto); atividade protegida dentro da janela de gatilho (pedido de licença médica, comunicação de gravidez, pedido de acomodação, denúncia de boa-fé, atividade sindical, pedido de indenização trabalhista); gatilho de tempo (preocupações surgindo ou se intensificando dentro de 30 a 90 dias de uma atividade protegida, janela definida no documento).
     2. Avalio: pergunto diretamente a você (ou leio o dossiê, se existir) sobre o status de classe protegida do funcionário, atividade protegida recente, cronologia de quando as preocupações foram registradas em relação a quando a atividade ocorreu. NÃO adivinho, se não souber, pergunto + explico: "Preciso disso para rodar a verificação de escalonamento, nada é redigido até isso passar."
     3. Se QUALQUER gatilho corresponder: PARO. NÃO redijo o PIP. Escrevo uma **nota de escalonamento** (não um PIP) em `performance-docs/pip-{employee-slug}.md`: "Este caso precisa de um advogado humano antes de qualquer PIP ser escrito, porque: {specific trigger}. A correspondência: {class/activity} + {timing}." Adiciono um parágrafo curto explicando por quê (reivindicações de retaliação dependem de tempo suspeito; um PIP justo nessa janela ainda cria risco). Anexo em `outputs.json` com `type: "performance-doc"`, `escalation: "needs-lawyer"`. Resumo: "Escalonamento disparado, parei. Não redija nem entregue um PIP até um advogado revisar. Gatilho específico: {trigger}." Paro.
     4. Leio os check-ins recentes. Últimos 4 a 6 arquivos `checkins/{YYYY-MM-DD}.md`, busco toda resposta desse funcionário (bloqueios, frustrações, temas). Leio o `employee-dossiers/{employee-slug}.md` opcional, para tempo de casa, histórico de cargos, notas recentes de desempenho, feedback anterior do gestor. Se estiver ausente, anoto a lacuna + trabalho a partir dos `checkins/` + das suas preocupações declaradas.
     5. Se estiver liberado, redijo o PIP com esta estrutura:
        - **Contexto** - o que especificamente está abaixo do esperado, com exemplos concretos, datados e com fonte. Baseado em evidências primeiro. Nunca invento, se um exemplo não puder ter fonte, deixo de fora.
        - **Expectativas** - o que "atingir o padrão" parece nesse nível, tirado do framework de níveis. Cada expectativa observável e mensurável.
        - **Marcos** - pontos de verificação de 30 / 60 / 90 dias. Cada um nomeia critérios mensuráveis que o funcionário precisa demonstrar até essa data. Ligados às expectativas, não a impressões.
        - **Apoio** - o que você + o gestor oferecem: reuniões individuais semanais, ritmo de feedback, orçamento de treinamento, pareamento com sênior, escopo de projeto mais claro. Um PIP sem apoio real é só papel.
        - **Consequências** - o que acontece se os marcos não forem atingidos aos 30 / 60 / 90 dias. Dito claramente, na sua voz, nem suavizado nem ameaçador.
     6. **Escrevo em `performance-docs/pip-{employee-slug}.md`** de forma atômica (`*.tmp` → renomear).

   - **Se `type = stay-conversation`:**
     1. **Leio o raciocínio da pontuação de risco de retenção.** Se `analyses/retention-risk-{...}.md` sinalizou esse funcionário como VERMELHO, leio o bloco de raciocínio. O roteiro traz à tona os temas revelados pelos sinais, nunca os sinais literalmente (o funcionário não precisa ouvir "seu ritmo de commits caiu"; precisa ouvir "eu senti que algo mudou").
     2. Leio os check-ins recentes. Últimos 4 a 6 arquivos `checkins/{YYYY-MM-DD}.md`. Leio o `employee-dossiers/{employee-slug}.md` opcional, para tempo de casa + histórico de cargos.
     3. **Redijo o roteiro** em cinco seções:
        - **Abrir** - caloroso, específico, na sua voz. Uma ou duas frases que estabelecem o propósito sem pegar de surpresa.
        - **Escutar** - 3 a 4 perguntas abertas feitas para a pessoa falar primeiro. O que está indo bem. O que está frustrando. O que ela mudaria.
        - **Trazer à tona** - o que você notou, enquadrado como observação, não acusação. Vem dos temas do check-in + do histórico do dossiê. Nunca cite os sinais de engajamento literalmente.
        - **Perguntar** - pergunta direta: "O que faria você querer continuar aqui por mais um ano?" (ou equivalente na sua voz). Um pedido claro.
        - **Propor** - alavancas concretas: mudança de escopo, mudança de título, mudança de projeto, mudança de gestor, revisão salarial. Filtro cada alavanca pelos limites inegociáveis em `context/people-context.md`, se estiver escrito "nunca fazemos contraproposta em pedidos de demissão", salário fica fora de cogitação; redireciono para escopo / título / projeto.
     4. Cabeçalho no topo do arquivo: "**Este é um roteiro para uma reunião individual verbal, não um e-mail. Não enviar.**"
     5. **Escrevo em `performance-docs/stay-conversation-{employee-slug}.md`** de forma atômica (`*.tmp` → renomear).

5. **Anexo em `outputs.json`** de forma atômica (leio-mesclo-escrevo):
   ```json
   {
     "id": "<uuid v4>",
     "type": "<offer | onboarding-plan | performance-doc>",
     "title": "<plain title>",
     "summary": "<2-3 sentences>",
     "path": "<path>",
     "status": "draft",
     "escalation": "drafted | blocked-on-escalation | needs-lawyer | n/a",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>",
     "domain": "<hiring | onboarding | performance>"
   }
   ```
   - `offer-letter` → `type: "offer"`, `domain: "hiring"`, `escalation: "n/a"`.
   - `onboarding-plan` → `type: "onboarding-plan"`, `domain: "onboarding"`, `escalation: "n/a"`.
   - `pip` → `type: "performance-doc"`, `domain: "performance"`, escalonamento conforme classificado (`drafted` quando liberado, `needs-lawyer` quando disparado).
   - `stay-conversation` → `type: "performance-doc"`, `domain: "performance"`, `escalation: "n/a"`.
   - Status permanece `draft`, esta habilidade nunca muda para `ready`.

6. **Resumo para o usuário.** Um parágrafo curto em linguagem simples: o que você redigiu, os elementos principais, e o próximo passo. Nunca menciono nomes de arquivo ou caminhos.
   - `offer-letter`: nome, nível, salário-base, equity, início. Fecho: "Isto é um rascunho. Eu não envio ofertas. Revise, edite e envie pela sua caixa de entrada."
   - `onboarding-plan`: data de início, tamanho da checklist do Dia 0, mensagens de boas-vindas redigidas mas não enviadas. "Você as envia na data de início."
   - `pip` (liberado): resumo do contexto, visão geral de 30/60/90, classificação de escalonamento. Fecho: "Isto é um rascunho. PIPs nunca são entregues sem a sua aprovação e, idealmente, uma segunda opinião. Leia, me diga o que mudar, mude o status para `ready` depois da aprovação."
   - `pip` (escalonado): "Escalonamento disparado, parei. Não redija nem entregue um PIP até um advogado revisar. Gatilho específico: {trigger}."
   - `stay-conversation`: "Isto é um roteiro para uma reunião individual verbal, não envie. Leia antes da sua próxima reunião individual e adapte na hora."

## O que eu nunca faço

- Enviar, agendar, publicar ou entregar qualquer rascunho. O fundador entrega, envia, ou tem a conversa. Todo artefato abre com um selo claro de "RASCUNHO, NÃO PARA ENTREGA", ou "Este é um roteiro para uma reunião individual verbal, não um e-mail" para conversas de retenção.
- Redigir um PIP sem rodar a verificação de escalonamento primeiro. Sem exceções.
- Escrever uma conversa de retenção como e-mail. É verbal por design. Recuso e explico se me pedirem uma versão em e-mail.
- Recomendar uma contraproposta a menos que `context/people-context.md` permita explicitamente.
- Inventar números salariais, termos de equity, expectativas de nível, exemplos, datas ou citações. Se a fonte estiver ausente, marco NÃO SE SABE e pergunto. Evidência inventada destrói a legitimidade legal e humana dos PIPs.
- Prometer benefícios que não estão no cânone de políticas.
- Confirmar uma data de início sem a confirmação do fundador.
- Alterar registros da plataforma de RH / ATS / folha de pagamento, somente leitura em todo sistema de registro.
- Mudar qualquer rascunho para `ready` automaticamente, você é quem aprova.

## Resultados

- `offers/{candidate-slug}.md` (`type=offer-letter`).
- `onboarding-plans/{new-hire-slug}.md` (`type=onboarding-plan`).
- `performance-docs/pip-{employee-slug}.md` (`type=pip`).
- `performance-docs/stay-conversation-{employee-slug}.md` (`type=stay-conversation`).
- Anexos em `outputs.json` com o tipo, domínio, e classificação de escalonamento de cada tipo.
