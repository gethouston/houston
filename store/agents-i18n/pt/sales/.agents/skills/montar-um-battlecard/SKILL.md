---
name: montar-um-battlecard
title: "Montar um battlecard"
description: "Construo um battlecard para um negócio específico contra um concorrente específico, não uma folha de comparação genérica. Uma grade de três critérios ancorada no que importa para esse prospect, três perguntas de descoberta com armadilha embutida, três respostas a objeções fundamentadas nos seus diferenciais reais, e dois pontos de prova das suas contas âncora. Cada afirmação cita uma fonte."
version: 1
category: Vendas
featured: no
image: handshake
integrations: [notion, reddit, firecrawl]
---


# Montar Um Battlecard

NÃO é uma folha de comparação genérica. Um card por prospect ancorado no que ESSE prospect valoriza.

## Quando usar

- Você: "eles estão nos avaliando contra {concorrente}" / "monte um battlecard para o negócio da Acme vs {concorrente}" / "como eu venço {concorrente} nesse caso".
- Chamado automaticamente por `write-my-outreach` ou `check-my-sales subject=discovery-call` quando um concorrente é citado na transcrição.

## Conexões que eu preciso

Eu executo trabalho externo pelo Composio. Antes desta skill rodar eu verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Raspagem de sites** - ler a página de marketing, o preço e as avaliações recentes do concorrente. Obrigatório.
- **Busca / pesquisa** - puxar avaliações recentes, threads de fórum e fraquezas conhecidas. Obrigatório.
- **CRM** - ler o contexto do negócio do prospect para ancorar o card. Opcional.

Se nenhuma das categorias obrigatórias estiver conectada eu paro e peço para você conectar o Firecrawl primeiro, já que o card depende de uma leitura atualizada do concorrente.

## Informações que eu preciso

Eu leio seu contexto de vendas primeiro. Para cada campo obrigatório que estiver faltando eu faço UMA pergunta em linguagem simples (melhor formato: app conectado > arquivo > URL > texto colado) e espero.

- **Seu playbook de vendas** - Obrigatório. Por que eu preciso: tiro dele os diferenciais, as contas âncora e os pontos de prova. Se estiver faltando eu pergunto: "Ainda não tenho seu playbook, quer que eu redija um agora?"
- **Nome do prospect e nome do concorrente** - Obrigatório. Por que eu preciso: o card é ancorado em um negócio específico contra um concorrente específico, não uma folha genérica. Se estiver faltando eu pergunto: "Para qual negócio é isso, e com qual concorrente eles estão nos comparando?"
- **Seu principal diferencial e sua maior fraqueza contra esse concorrente** - Obrigatório. Por que eu preciso: o card só é honesto se eu souber como você realmente ganha e perde. Se estiver faltando eu pergunto: "Qual é honestamente seu principal diferencial contra esse concorrente, e sua maior fraqueza?"
- **Vitórias com clientes âncora parecidos com o prospect** - Opcional. Por que eu preciso: os pontos de prova pesam mais quando combinam com o perfil do prospect. Se você não tiver, eu sigo em frente com PENDENTE.

1. **Identificar prospect + concorrente.** Carrego a linha do lead em `leads.json` e `calls/{slug}/notes-*.md` se a call existir, os critérios de avaliação específicos do prospect e as dores declaradas viram a âncora.
2. **Ler nosso produto + posicionamento.** `context/sales-context.md` para o que afirmamos, especialmente as seções "Top 3 concorrentes" e "Categoria e diferenciais". Se estiver fraco, pergunto uma vez: "Qual é honestamente seu top 3 de diferenciais contra {concorrente}? E sua maior fraqueza? (Para incorporar ao playbook, cole aqui ou aponte para uma URL do Notion / Google Docs.)"
3. **Pesquisar o concorrente.** Rodo `composio search` para as ferramentas de pesquisa disponíveis. Coleto:
   - Posicionamento da página de marketing (frase de efeito, top 3 afirmações)
   - Formato público de preço (planos, modelo)
   - Avaliações recentes dos últimos 6 meses (G2 / Capterra / Reddit / threads de fórum, via qualquer ferramenta de busca conectada)
   - Fraquezas conhecidas (reclamações sobre {X}, queixas de performance, funcionalidades faltando)
   Registro fontes + datas.
4. **Pesquisar o caso de uso do prospect.** A partir do dossiê e das notas de call, resumo em 2 linhas: o que eles precisam que a ferramenta faça, e os top 3 critérios.
5. **Montar a grade de comparação** para os top 3 critérios DELES apenas (não uma matriz de 30 linhas de funcionalidades). Cada um: nós vs eles, veredito honesto (GANHAMOS / ELES GANHAM / EMPATE), um motivo em uma frase.
6. **Perguntas com armadilha embutida.** 3 perguntas para você fazer na próxima call que trazem à tona as fraquezas do concorrente naturalmente, não são pegadinhas, são descoberta genuína. Cada uma ligada a uma dor conhecida do concorrente.
7. **Respostas a objeções.** Antecipo 3 objeções que o representante do concorrente levanta sobre nós, redijo uma resposta de 2 frases para cada, fundamentada nos nossos diferenciais (sem afirmações falsas).
8. **Pontos de prova para citar.** 2 a 3 histórias de clientes da seção de contas âncora do playbook que combinam com o perfil do prospect. Se as contas âncora estiverem fracas, peço uma vez uma URL do Notion / Google Docs com as vitórias mais citadas, e incorporo ao playbook na próxima execução de `set-up-my-sales-info`.
9. **Escrevo** em `battlecards/{competitor-slug}-{prospect-slug}.md` com: cabeçalho de prospect + concorrente, grade de critérios, perguntas com armadilha embutida, respostas a objeções, pontos de prova, rodapé com as fontes da pesquisa.
10. **Adiciono ao `outputs.json`**, lendo, mesclando e escrevendo atomicamente: `{ id (uuid v4), type: "battlecard", title: "{Prospect} vs {Concorrente}", summary, path, status: "draft", createdAt, updatedAt, domain: "meetings" }`.
11. **Entrego para você:** "Battlecard pronto, grade de 3 critérios, 3 perguntas com armadilha embutida, 3 respostas a objeções, 2 pontos de prova. Quer que eu incorpore isso no rascunho de acompanhamento com `write-my-outreach stage=followup`?"

## Regra de honestidade

Nunca invento "eles são fracos em {X}" sem uma fonte citada. Se uma afirmação não tem fonte, marco "(hipótese, verificar)" para você não repetir como fato. Battlecards inventados explodem na sua cara em demos.

## Saídas

- `battlecards/{competitor-slug}-{prospect-slug}.md`
- Adiciona ao `outputs.json` com `type: "battlecard"`, `domain: "meetings"`.
