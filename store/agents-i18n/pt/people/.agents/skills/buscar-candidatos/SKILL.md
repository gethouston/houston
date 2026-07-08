---
name: buscar-candidatos
title: "Buscar candidatos"
description: "Trago uma lista classificada de candidatos para uma vaga aberta, vindos do GitHub, LinkedIn, comunidades ou contribuidores de código aberto. Avalio cada um de acordo com a rubrica da vaga para você não precisar ler 200 perfis do LinkedIn. Você também pode usar essa habilidade para criar a rubrica de uma nova vaga antes de buscar candidatos."
version: 1
category: Pessoas
featured: yes
image: busts-in-silhouette
integrations: [github, linkedin, firecrawl]
---


# Buscar Candidatos

## Quando usar

- Explícito: "encontre candidatos para {vaga}", "busque engenheiros no GitHub", "monte uma lista de sourcing para {vaga}", "busque 20 candidatos para {vaga} a partir de {sinal}".
- Variante de criação de rubrica: "atualize a rubrica para {vaga}", "defina os requisitos essenciais para a vaga de {vaga}", pergunto uma vez pelo nível-alvo, os 3 principais requisitos essenciais, os 3 principais diferenciais, 2 a 3 sinais de alerta, escrevo `reqs/{role-slug}.md`, e paro (pulo a coleta de dados) para que toda outra habilidade de contratação leia a rubrica primeiro.
- Implícito: acionado pelo fundador no início de uma frente de contratação, ou durante uma sessão de planejamento de vaga.
- Seguro por vaga e por sinal. Mantenho as listas curtas (≤ 30 por rodada) para que a classificação faça sentido.

## Conexões que preciso

Faço o trabalho externo pelo Composio. Antes de rodar esta habilidade, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu nomeio a categoria, peço para você conectá-la na aba Integrações e paro.

- **Coleta de dados na web (Firecrawl)** , buscar perfis públicos e páginas de sinal. Obrigatório.
- **Engenharia (GitHub)** , avaliar contribuidores open source e ler sinais de repositório. Obrigatório quando a fonte é o GitHub.
- **Coleta de dados na web (LinkedIn)** , avaliar perfis públicos do LinkedIn. Obrigatório quando a fonte é o LinkedIn.
- **ATS (Ashby, Greenhouse, Lever, Workable)** , eliminar duplicatas em relação ao pipeline já existente. Opcional.

Se nenhuma das categorias obrigatórias estiver conectada, eu paro e peço para você conectar o Firecrawl primeiro.

## Informações que preciso

Primeiro leio o seu contexto de pessoas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar texto) e espero.

- **Rubrica da vaga** , Obrigatório. Por que preciso: avalio todo candidato de acordo com seus requisitos essenciais. Se estiver faltando, pergunto: "Para qual vaga estamos buscando, qual nível, e quais são seus três principais requisitos essenciais?"
- **Fonte de sinal** , Obrigatório. Por que preciso: preciso de um lugar de onde puxar nomes. Se estiver faltando, pergunto: "De onde devo buscar, uma organização no GitHub, uma busca no LinkedIn, uma lista de comunidade, ou uma lista de participantes de uma conferência?"
- **Empresas a excluir** , Opcional. Por que preciso: mantém fora da lista pessoas que você já descartou. Se você não tiver isso, sigo com "a definir".

## Passos

1. **Leio o documento de contexto de pessoas** em `context/people-context.md`. Se estiver faltando ou vazio, aviso o usuário: "Preciso primeiro do seu contexto de pessoas, rode a habilidade set-up-my-people-info." Paro. Extraio o framework de nivelamento e notas existentes sobre a estrutura da equipe para a vaga-alvo.
2. **Leio a vaga.** Procuro `reqs/{role-slug}.md`. Se estiver faltando, faço UMA pergunta direcionada ("Qual é o nível-alvo e os 3 principais requisitos essenciais para {vaga}? Vou salvar uma rubrica curta em `reqs/{role-slug}.md` e continuar."). Escrevo o arquivo, continuo.
3. **Leio a configuração.** `config/context-ledger.json`, ATS conectado (para eliminar duplicatas depois) e a lista de vagas abertas (`domains.people.reqs`).
4. **Confirmo a fonte de sinal** informada (repositório / organização no GitHub, URL de busca no LinkedIn, post de comunidade / fórum, lista de participantes de conferência, grafo de contribuidores open source). Se nenhuma for informada, faço uma pergunta direcionada.
5. **Descubro ferramentas pelo Composio.** Rodo `composio search web-scrape` para coleta de dados do LinkedIn / perfis públicos, e `composio search ats` se o ATS for consultado para eliminar duplicatas. Se a categoria obrigatória não estiver conectada, aviso o usuário qual conectar na aba Integrações. Paro.
6. **Busco os candidatos.** Executo os identificadores de ferramentas descobertos contra a fonte de sinal. Limito a cerca de 30 resultados. Por candidato, capturo: nome, URL de perfil / sinal, cargo e empresa atuais, tempo de casa, competências-chave observáveis no sinal, uma linha sobre "por que esse sinal é relevante".
7. **Avalio de acordo com a rubrica.** Por candidato, marco requisitos essenciais atendidos / faltando em relação à rubrica do passo 2. Produzo uma faixa de adequação de 0 a 3: **forte / talvez / fraco**. Trago à tona até 3 sinais de alerta por candidato (padrão de tempo de casa, geografia / autorização se informada, sobreposição com empresas excluídas por instrução do fundador). Nunca infiro atributos de classe protegida.
8. **Escrevo** a lista de sourcing em `sourcing-lists/{role-slug}-{YYYY-MM-DD}.md` de forma atômica (`*.tmp` → renomeação). Estrutura: Resumo da vaga (nível + requisitos essenciais da rubrica) → Top 5 contatos de maior convicção → Tabela classificada com todos os candidatos (nome, link, faixa de adequação, motivo em uma linha, sinais de alerta).
9. **Adiciono a `outputs.json`** , leio o array existente, adiciono `{ id, type: "sourcing", title, summary, path, status: "draft", createdAt, updatedAt }`, escrita atômica.
10. **Resumo para o usuário** , um parágrafo nomeando os top 5 contatos, o caminho para a lista completa, categoria / ferramenta usada.

## Nunca invento

Todo candidato precisa remeter a um sinal real e verificável por URL. Se o perfil for privado / 404 / ambíguo, marco o candidato como DESCONHECIDO nesse campo, sem chutar tempo de casa, cargo ou competências.

## Saídas

- `sourcing-lists/{role-slug}-{YYYY-MM-DD}.md`
- Adição em `outputs.json` com tipo `sourcing`.
