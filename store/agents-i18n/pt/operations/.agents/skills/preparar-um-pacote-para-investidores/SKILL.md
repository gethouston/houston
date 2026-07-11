---
name: preparar-um-pacote-para-investidores
title: "Preparar um pacote para investidores"
description: "Redija o pacote que você precisa para o seu conselho ou seus investidores sem partir de uma página em branco. Escolha o que você precisa: um pacote para o conselho com as 8 seções padrão (resumo executivo, atualização do negócio, métricas, metas, conquistas, desafios, pedidos e anexo); ou uma atualização mensal ou trimestral para investidores escrita na sua voz e baseada no avanço real das suas metas, decisões e métricas. Eu sinalizo cada dado pendente em vez de inventar números."
version: 1
category: Operações
featured: no
image: clipboard
integrations: [googledocs, googledrive, notion]
---


# Preparar um pacote para investidores

Uma habilidade, dois artefatos na voz do fundador: pacote para o conselho e atualização para investidores. Ambos são montagens opinativas sobre dados que você já tem: metas, decisões, métricas, conquistas, desafios.

## Quando usar

- `type=board-pack` - "prepare o pacote do conselho do T{N}" / "monte o pacote do conselho de {yyyy-qq}" / reunião do conselho a 2+ semanas de distância, conforme o ritmo com investidores.
- `type=investor-update` - "redija a atualização mensal para investidores" / "escreva a carta do T{N} para investidores" / atualização vencendo conforme o ritmo.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, eu verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Documentos / notas** (Google Docs, Notion) - Opcional. Se conectado, eu espelho o rascunho para você poder editar e compartilhar sem sair da sua ferramenta habitual.
- **Arquivos** (Google Drive) - Opcional. Permite que eu coloque uma cópia na pasta compartilhada certa.
- **Warehouse / fonte de dados** - Opcional. Permite que eu atualize os números das métricas se os retratos do `set-up-tracking` estiverem desatualizados.

Esta habilidade funciona sem nenhuma conexão, pacotes para o conselho e atualizações para investidores são rascunhados localmente primeiro. Eu nunca bloqueio aqui.

## Informações que eu preciso

Eu leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > arquivo enviado > URL > colar) e espero.

- **Retrato da empresa** - Obrigatório. Por que eu preciso: o parágrafo de abertura se apoia no estágio, no pitch e no que é verdade hoje. Se estiver faltando, eu pergunto: "Em uma ou duas frases, o que a empresa faz, para quem é e onde vocês estão hoje?"
- **Sua voz** - Obrigatório. Por que eu preciso: atualizações para investidores precisam soar como você, não como um modelo. Se estiver faltando, eu pergunto: "O melhor é conectar sua caixa de entrada para eu analisar de 20 a 30 mensagens enviadas. Caso contrário, cole de 3 a 5 e-mails ou cartas que você escreveu que soam como você."
- **Ritmo com investidores** - Obrigatório. Por que eu preciso: mensal versus trimestral muda o escopo, o tamanho e o que conta como conquista. Se estiver faltando, eu pergunto: "Com que frequência você atualiza os investidores, mensal, trimestral, ambos? E quais investidores recebem?"
- **Período do relatório** - Obrigatório. Por que eu preciso: ancora a busca das métricas e a janela de decisões. Se estiver faltando, eu pergunto: "Qual período esta atualização cobre, o mês passado, o trimestre passado, o ano até agora?"
- **Último retrato de metas, decisões e métricas** - Obrigatório. Por que eu preciso: eu monto a partir do seu trabalho salvo, nunca invento. Se estiver faltando, eu pergunto: "Quer que eu atualize suas metas e métricas primeiro? O pacote fica mais completo."

## Parâmetro: `type`

- `board-pack` - rascunho de apresentação de 8 seções para a reunião trimestral do conselho. Saída: `board-packs/{yyyy-qq}/board-pack.md` (+ espelho opcional em Google Doc via Composio, se conectado).
- `investor-update` - narrativa na voz do CEO para a atualização mensal ou trimestral. Saída: `investor-updates/{yyyy-qq}/update.md`.

## Passos

1. Leio `config/context-ledger.json`. Preencho lacunas com UMA pergunta ordenada por modalidade.
2. Leio `context/operations-context.md`, prioridades ativas, ritmo operacional, limites inegociáveis, notas de voz. Ancora o que "avanço" significa.
3. Reúno os dados de origem:
   - Último retrato de metas de `goal-history.json` (de `track-my-goals`). Calculo o avanço em relação ao período anterior.
   - Decisões em `decisions.json` + notas por decisão em `decisions/{slug}/` dentro do período do relatório.
   - Valores de métricas de `metrics-daily.json` (de `set-up-tracking`) e `rollups/` (de `run-my-ops-review period=metrics-rollup`).
   - Revisões semanais em `reviews/` do período.
   - Anomalias abertas em `anomalies.json`.
   - Gargalos em `bottlenecks.json`.

4. Ramifico conforme `type`:

   **Se `type = board-pack`:**
   - Redijo o pacote de 8 seções:
     1. **Resumo executivo** - uma página, 3 a 5 tópicos: maior avanço, maior pedido, maior risco.
     2. **Atualização do negócio** - narrativa, 300 a 500 palavras. O que foi entregue, o que importa, o próximo passo.
     3. **Métricas** - tabela das métricas monitoradas: atual / período anterior / direção / comentário.
     4. **Metas** - status em nível de meta-métrica (no caminho certo / em risco / fora do caminho) com causa raiz para as fora do caminho.
     5. **Conquistas** - 3 a 5 conquistas específicas, cada uma ancorada em uma métrica ou decisão.
     6. **Desafios** - 2 a 4 desafios específicos, cada um com uma hipótese e o que estamos tentando.
     7. **Pedidos** - pedidos explícitos ao conselho (apresentações, conselhos, decisões).
     8. **Anexo** - links para registros de decisões, consultas detalhadas, revisões semanais.
   - Sinalizo todo campo não preenchido com `TBD - {o que você precisa trazer}`. Nunca invento números.

   **Se `type = investor-update`:**
   - Redijo a narrativa na voz do CEO (cerca de 600 a 900 palavras):
     - Abertura: um parágrafo, estágio + o que é verdade hoje.
     - Destaques: 3 a 5 tópicos de avanço (métrica / decisão / lançamento).
     - Pontos baixos: 1 a 2 itens honestos com mitigação.
     - Bloco de status das metas-métricas: uma linha por meta-métrica com direção.
     - Pedidos: 2 a 3 itens específicos, apresentações, conselhos, tempo para trocar ideias.
     - Fechamento: um parágrafo, foco do próximo período.
   - Confiro a voz contra `config/voice.md` + prioridades de `context/operations-context.md`.
   - Sinalizo todo dado pendente.

5. Escrevo de forma atômica (`.tmp` → renomear) no caminho.
6. Se `googledocs` ou `notion` estiver conectado e você tiver optado por isso, espelho o rascunho no formato preferido com link de volta.
7. Adiciono a `outputs.json` com `{id, type, title, summary, path, status: "draft", createdAt, updatedAt, domain: "planning"}`. Type = `"board-pack"` ou `"investor-update"`.
8. Resumo: caminho + todo dado pendente sinalizado + uma coisa para revisar primeiro (ex.: "A seção de Desafios, a hipótese da queda na página de preços é minha, não sua, confira antes de enviar").

## Saídas

- `board-packs/{yyyy-qq}/board-pack.md` (+ espelho opcional em Google Doc).
- `investor-updates/{yyyy-qq}/update.md` (+ espelho opcional em Google Doc).
- Adiciona a `outputs.json`.

## O que eu nunca faço

- Enviar, publicar, compartilhar. Só rascunhos, você revisa, edita, envia.
- Inventar métricas, citações ou avanço sem evidência. Dado pendente não é falha, é estado honesto.
- Prometer resultados. "Vamos bater {meta-métrica} até {data}" → só se você disse isso.
- Mexer em registros de investidores no CRM.
