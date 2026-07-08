---
name: avaliar-um-fornecedor
title: "Avaliar um fornecedor"
description: "Faça a due diligence de um fornecedor antes de assinar. Escolha o que você precisa: uma avaliação de encaixe que dá uma nota de 1 a 10 segundo seus critérios, com nível de risco e recomendação, ou uma verificação de compliance que confirma os frameworks deles, identifica os responsáveis pela segurança e mostra incidentes públicos. Cada afirmação vem com uma fonte."
version: 1
category: Operações
featured: no
image: clipboard
integrations: [linkedin, firecrawl, perplexityai]
---


# Avaliar Um Fornecedor

Uma skill para due diligence de fornecedores. O parâmetro `aspect` escolhe o ângulo: uma avaliação de encaixe comercial contra o seu critério de fornecedores, ou um relatório de pesquisa de compliance com fontes públicas. Os dois se baseiam no seu contexto operacional para que os limites de risco correspondam à sua postura.

## Parâmetro: `aspect`

- `fit`  -  due diligence comercial baseada em critérios. Dá nota de 1 a 10 ao fornecedor contra seu critério, atribui nível de risco (verde / amarelo / vermelho), mostra pontos fortes, preocupações, perguntas para a primeira ligação, e uma recomendação. Saída: `evaluations/{supplier-slug}.md`.
- `compliance`  -  pesquisa de compliance com fontes públicas. Cataloga os frameworks alegados, triangula com verificação independente, identifica os responsáveis pela segurança, lista incidentes dos últimos 3 anos. Cada afirmação vem com fonte. Saída: `compliance-reports/{company-slug}.md`.

O usuário nomeia o aspect em linguagem simples ("avalie a Stripe", "a Vercel é um bom encaixe", "verificação de compliance na Mongo", "a Notion está limpa") -> eu infiro. Ambíguo -> pergunto UMA pergunta nomeando as duas opções.

## Quando usar

**fit:**
- "avalie {fornecedor} para {produto / serviço}"
- "dê nota a esses fornecedores segundo nossos critérios"
- "{fornecedor} é um bom encaixe para {nosso caso de uso}"
- Chamado de `score-an-inbound` quando o inbound é uma candidatura de fornecedor.

**compliance:**
- "rode due diligence de compliance na {fornecedor}"
- "a postura de compliance da {empresa} é real"
- "quais frameworks a {fornecedor} realmente tem"
- Chamado como sub-etapa de `aspect=fit` para fornecedores sensíveis a risco (processadores de dados, infraestrutura, serviços financeiros).

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar eu verifico se as categorias abaixo estão conectadas. Faltando -> eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Pesquisa na web** (Firecrawl, Exa, Perplexity)  -  Obrigatório (ambos os aspects). Para `fit`: puxa o site do fornecedor, preços, cases, notícias recentes. Para `compliance`: puxa páginas de confiança, páginas de segurança, cobertura de notícias, triangula as alegações de frameworks.
- **Caixa de entrada** (Gmail, Outlook)  -  Opcional para `fit`. Mostra correspondência anterior para eu não começar do zero. Não usado para `compliance`.
- **Rede social / profissional** (LinkedIn)  -  Opcional para `compliance`. Me permite confirmar se um CCO / CISO nomeado é real e ativo. Não usado para `fit`.

Se nenhum provedor de pesquisa na web estiver conectado, eu paro e peço para você conectar um provedor de pesquisa primeiro.

## Informações que eu preciso

Eu leio primeiro o seu contexto operacional. Para cada campo obrigatório que estiver faltando eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Postura com fornecedores**  -  Obrigatório (ambos os aspects). Por que preciso: molda o quão rígido eu sou com alertas de risco (`fit`) e o que conta como um alerta vermelho material (`compliance`). Se faltando eu pergunto: "Como você lida com fornecedores  -  de forma conservadora, equilibrada, ou rápida?"
- **Para que você está avaliando eles**  -  Obrigatório para `fit`. Por que preciso: um processador de pagamentos e uma agência de design são avaliados em coisas diferentes. Se faltando eu pergunto: "Para que você está considerando este fornecedor, e como seria o sucesso em 6 meses?"
- **Critério de fornecedores**  -  Opcional para `fit`. Por que preciso: me permite avaliar contra seus critérios, não um genérico. Se você não tiver isso eu sigo com o critério padrão e nomeio isso na saída.
- **Prioridades ativas**  -  Obrigatório para `fit`. Por que preciso: define a nota de encaixe com as prioridades. Se faltando eu pergunto: "Quais são as 2 a 3 coisas que a empresa está priorizando neste trimestre?"
- **Empresa a investigar**  -  Obrigatório para `compliance`. Por que preciso: a skill mira em uma empresa por vez. Se faltando eu pergunto: "Em qual empresa devo rodar a verificação de compliance?"
- **Vetos**  -  Opcional para `compliance`. Por que preciso: me permite dar mais peso a frameworks específicos (HIPAA, PCI, SOC2) quando eles importam para você. Se você não tiver isso eu sigo com A DEFINIR e mostro toda lacuna que encontrar.

## Passos

### Passos compartilhados (ambos os aspects)

1. **Ler `context/operations-context.md`.** Postura com fornecedores, vetos, prioridades ativas ancoram os limites de severidade. Se faltando: parar, pedir para o usuário rodar `set-up-my-ops-info` primeiro.

### Ramificar em `aspect`:

#### `fit`

2. **Ler `config/supplier-rubric.md`.** Se faltando, usar o padrão definido em `data-schema.md` (encaixe / sinais-de-qualidade / qualidade-das-referências / sinais-de-risco / atrito-para-começar).

3. **Ler `config/procurement.json`**  -  apetite de risco + autoridade de assinatura ancoram os limites de severidade.

4. **Reunir evidências.**
   - **Superfície própria do fornecedor**  -  `composio search web-scrape` -> puxar site, página de preços, docs, cases.
   - **Perfil público**  -  fundadores, tamanho/estágio, clientes notáveis, notícias recentes. Usar `composio search research` ou `web-search`.
   - **Correspondência anterior**  -  `composio search inbox` -> buscar o nome do fornecedor ou domínio na caixa de entrada do fundador.
   - **Referências que você pode triangular**  -  cases públicos com nomes identificáveis; sinalizar se algum estiver nos Contatos Chave do contexto operacional.
   - **Verificação rápida de compliance**  -  rodar esta skill com `aspect=compliance` como sub-etapa para qualquer fornecedor sensível a risco (processadores de dados, infraestrutura, fornecedores de serviços financeiros).
   - **Sinal de preço**  -  o que é descobrível. Se estiver atrás de um contato de vendas, anotar isso.

5. **Dar nota contra o critério.** Por critério:
   - Nota de 1 a 5 (ou a escala que o critério especificar).
   - 1 a 2 linhas de evidência com URLs de fonte.
   - Marcador explícito `INSUFFICIENT-EVIDENCE` se o dado não existir  -  nunca chutar.

   Calcular a nota geral (soma ponderada segundo o critério) de 0 a 10.

6. **Atribuir o nível de risco.**
   - **Verde**  -  nota geral >= 8 E sem alertas vermelhos no critério de sinais-de-risco.
   - **Amarelo**  -  nota geral entre 6 e 7,9 OU uma preocupação material.
   - **Vermelho**  -  nota geral < 6 OU qualquer violação de veto (tratamento de dados, incidente de compliance, deturpação óbvia).

7. **Produzir a saída** (salvar em `evaluations/{supplier-slug}.md`):
   - **Resumo**  -  2 frases: quem eles são + o que fazem.
   - **Critério + tabela de notas**  -  critério | nota | evidência (com URLs).
   - **Pontos fortes**  -  3 tópicos, o mais convincente primeiro.
   - **Preocupações**  -  3 tópicos, o mais material primeiro.
   - **Nível de risco**  -  com um motivo de 1 linha.
   - **Perguntas para a primeira ligação**  -  5 a 8 perguntas objetivas que fecham lacunas de evidência e/ou expõem risco escondido.
   - **Recomendação**  -  `Proceed` / `Pass` / `Get more info` com uma justificativa de 3 linhas.
   - **Decisão do fundador**  -  em branco; o fundador preenche.

8. **Escritas atômicas**  -  `*.tmp` -> renomear.

9. **Adicionar a `outputs.json`** com `type: "supplier-evaluation"`, status "draft" (só o fundador marca "ready" depois de decidir).

10. **Resumir para o usuário**  -  nível + nota geral + a coisa número 1 que o fundador deve resolver antes de decidir.

#### `compliance`

2. **Reunir sinais públicos.**
   - **Frameworks alegados na superfície deles**  -  `composio search web-scrape` -> puxar página de confiança, página de segurança, página de privacidade. Catalogar as alegações (SOC2 Type II, ISO 27001, HIPAA, GDPR, PCI-DSS, etc.).
   - **Verificação independente**  -  para cada alegação, triangular: o provedor de trust-center (TrustArc, Vanta, Drata) confirma? Existe um comunicado citando um auditor específico? Existe ID de relatório ou portal de confiança? Usar `composio search research` com buscas específicas.
   - **CCO / CISO / Head de Segurança nomeado**  -  identificar a pessoa, linkar o LinkedIn se encontrável (`composio search social` ou `web-search`).
   - **Incidentes públicos dos últimos 3 anos**  -  violações, divulgações à SEC, ações coletivas, ações regulatórias (FTC, ICO, procuradorias estaduais). Usar `composio search news` + `web-search` com buscas pontuais.
   - **Postura legal / regulatória**  -  litígios em aberto nomeando a empresa como ré? Registros na SEC se a empresa for pública?

3. **Verificar lacunas entre alegação e evidência.**
   - Alega SOC2 mas sem confirmação independente em lugar nenhum -> sinalizar.
   - Oficial nomeado mas sem LinkedIn / sem presença pública -> sinalizar.
   - Silêncio sobre um framework que a categoria deles normalmente exige (por exemplo, SaaS de saúde sem menção a HIPAA) -> sinalizar.

4. **Produzir a saída** (salvar em `compliance-reports/{company-slug}.md`):
   - **Resumo**  -  1 parágrafo: quem eles são + a postura de compliance em uma linha.
   - **Frameworks alegados**  -  tabela: framework | fonte da alegação | verificação independente (S/N com URL) | notas.
   - **Liderança de segurança nomeada**  -  nome, cargo, LinkedIn, tempo no cargo se encontrável.
   - **Incidentes públicos (últimos 3 anos)**  -  lista cronológica, cada um com URL de fonte + descrição de 1 linha.
   - **Lacunas entre alegação e evidência**  -  lista de tópicos, o mais material primeiro.
   - **Resumo em formato de recomendação**  -  NÃO é parecer jurídico: "na superfície pública parece {forte / adequado / raso / preocupante}" com 2 a 3 coisas específicas para verificar antes de assinar.
   - **Cada alegação cita a URL de fonte.** Nenhuma afirmação sem fonte.

5. **Escritas atômicas**  -  `*.tmp` -> renomear.

6. **Adicionar a `outputs.json`** com `type: "compliance-report"`, status "ready".

7. **Resumir para o usuário**  -  resumo em formato de recomendação + a lacuna número 1 que o fundador deve fechar antes de assinar.

## O que eu nunca faço

- **Contatar o fornecedor.** Perguntas para a primeira ligação são para o fundador. Redigir a mensagem é uma skill separada (`draft-a-message type=vendor`).
- **Me comprometer com uma decisão.** Eu recomendo; o fundador decide.
- **Dar nota sem critério.** Se não existir critério e o fundador não fornecer um, usar o padrão e nomear isso na saída.
- **Emitir parecer jurídico.** "Parece adequado na superfície pública" é o mais longe que eu vou. Revisão jurídica é trabalho do advogado do fundador.
- **Tratar alegação de página de confiança como prova.** Toda alegação de framework precisa de pelo menos um sinal independente, senão é sinalizada.
- **Recuperar dado não público.** Se estiver atrás de login, portal de confiança com NDA, ou pedido específico, anotar como "solicitar ao fornecedor" em vez de extrair.

## Saídas

- `evaluations/{supplier-slug}.md` (aspect=fit) -> adiciona a `outputs.json` com `type: "supplier-evaluation"`, status "draft".
- `compliance-reports/{company-slug}.md` (aspect=compliance) -> adiciona a `outputs.json` com `type: "compliance-report"`, status "ready".
