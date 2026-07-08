---
name: acompanhar-minhas-metas
title: "Acompanhar minhas metas"
description: "Veja onde você realmente está com suas metas sem precisar montar tudo na mão. Eu atualizo o valor atual de cada métrica de meta a partir do seu rastreador de metas conectado, classifico como no caminho certo, em risco ou fora do caminho em relação à curva de cumprimento esperada, e mostro as causas raiz prováveis a partir de decisões e prioridades vinculadas. Execute semanalmente ou sempre que alguém perguntar como está o trimestre."
version: 1
category: Operações
featured: no
image: clipboard
integrations: [googlesheets, notion, airtable, linear, linkedin]
---


# Acompanhar Minhas Metas

## Quando usar

- Usuário pede status das metas, quer atualização, ou pergunta "o que está fora do caminho."
- Cadência semanal / trimestral  -  se a última captura em
  `goal-history.json` for mais antiga que 10 dias.
- Início de um novo trimestre  -  rebaseline.
- Puxado implicitamente por `prep-an-investor-package`
  quando a última captura estiver desatualizada.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar eu verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Rastreador de metas** (Notion, Airtable, Google Sheets, Linear)  -  Obrigatório se suas metas vivem em uma dessas ferramentas. Puxa os valores atuais mais recentes por métrica de meta.
- **Warehouse / fonte de dados**  -  Opcional. Se uma métrica de meta corresponde a uma métrica acompanhada, eu leio o valor mais recente de lá para manter consistência.

Se suas metas vivem em uma ferramenta conectada mas nada está conectado, eu paro e peço para você conectar seu rastreador de metas primeiro.

## Informações que eu preciso

Eu leio primeiro o seu contexto operacional. Para cada campo obrigatório que estiver faltando eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Suas metas**  -  Obrigatório. Por que preciso: eu atualizo metas existentes, eu não as invento. Se faltando eu pergunto: "Onde suas metas vivem? O melhor é conectar a ferramenta onde elas são acompanhadas. Senão, envie o documento ou cole e eu capturo a estrutura."
- **Prioridades ativas**  -  Obrigatório. Por que preciso: define a atribuição de 'causa raiz provável' para métricas de meta fora do caminho. Se faltando eu pergunto: "Quais são as 2 a 3 coisas que a empresa está priorizando neste trimestre?"
- **Responsáveis pelas métricas de meta**  -  Opcional. Por que preciso: quando eu não consigo ler um número de uma fonte conectada, eu digo qual responsável você deve acionar. Se você não tiver isso eu sigo com A DEFINIR e pergunto antes de inventar.
- **Curva de cumprimento**  -  Opcional. Por que preciso: métricas de meta concentradas no início versus no final do período classificam de forma diferente no meio do trimestre. Se você não tiver isso eu sigo com A DEFINIR usando um padrão linear.

## Passos

1. **Ler `context/operations-context.md`.** Se
   faltando ou vazio, parar e pedir para você rodar
   `set-up-my-ops-info` primeiro. Prioridades ativas
   definem a atribuição de "causa raiz provável" para métricas de meta fora do caminho.

2. **Ler `config/goals.json`.** Se faltando ou vazio, fazer UMA
   pergunta objetiva: *"Ainda sem metas  -  melhor: se o rastreador de metas
   estiver conectado via Composio, aponte para ele e eu puxo o estado atual.
   Senão, cole ou envie o documento de metas.
   Se ainda não há metas, tudo bem  -  diga isso e eu ajudo a
   rascunhar um conjunto inicial."* Escrever e continuar.

3. **Para cada objetivo, atualizar o valor atual de cada métrica de meta.** Em
   ordem de preferência:
   - **Rastreador de metas conectado via Composio**  -  `composio search goal`
     (ou categoria que o usuário nomeou durante o onboarding). Puxar
     o `current` mais recente por métrica de meta.
   - **Handoff de acompanhamento de métricas**  -  se a métrica de meta corresponde a uma métrica acompanhada
     neste agente, citar o slug da query e ler
     o valor mais recente de `metrics-daily.json`. Mantém
     os números consistentes entre agentes.
   - **Perguntar ao responsável**  -  se nenhum estiver disponível, dizer a você
     quais responsáveis acionar e parar antes de inventar números.

4. **Capturar em `goal-history.json`.** Adicionar um registro por
   objetivo (ou por métrica de meta se o responsável atualizar no nível da métrica de meta) com
   `{ objectiveId, date, goalMetrics: [{ id, value, state }], state,
   createdAt }`. Data de hoje (YYYY-MM-DD).

5. **Classificar cada métrica de meta contra a meta alvo.** Puxar a curva de
   cumprimento esperada do registro da métrica de meta (padrão `linear`, a menos que
   o usuário tenha declarado concentração no início/fim durante o onboarding ou
   atualização anterior). Para o ponto de hoje no período:
   - `on-track`  -  `current / target` ≥ `expected-for-this-point`.
   - `at-risk`  -  dentro de 20 pontos percentuais do esperado, mas abaixo.
   - `off-track`  -  mais de 20 pontos percentuais abaixo do esperado.

   Limite de 20 pontos percentuais = padrão documentado; o usuário pode sobrescrever
   por métrica de meta em `config/goals.json`.

6. **Consolidar os estados das métricas de meta no estado do objetivo.** Se alguma métrica de meta estiver
   `off-track`, o objetivo fica `off-track`. Se alguma estiver `at-risk` e
   nenhuma `off-track`, o objetivo fica `at-risk`. Senão, `on-track`.
   Atualizar `config/goals.json` com o novo estado + os valores
   `current` atualizados.

7. **Anexar códigos de motivo a partir de decisões vinculadas.** Para cada métrica de meta
   em risco / fora do caminho:
   - Buscar em `decisions.json` decisões onde
     `linkedInitiativeSlugs` inclui o mesmo slug que a métrica de meta referencia
     (se houver)  -  decisão pendente recente em uma iniciativa vinculada =
     causa provável.
   - Verificar as prioridades do contexto operacional  -  se a métrica de meta está
     vinculada a uma prioridade inativa, apontar isso.
   - Registrar o motivo no campo `reason` da métrica de meta em
     `config/goals.json`.

8. **Relatar no chat.**

   ```
   Atualização de metas  -  {YYYY-MM-DD}

   No caminho: {N}  |  Em risco: {N}  |  Fora do caminho: {N}

   Fora do caminho:
   - {objetivo}  -  {métrica de meta}: {current}/{target} {unit} ({% atingido}).
     Causa provável: {slug da decisão vinculada ou nota de prioridade}.

   Em risco:
   - ...

   (Histórico completo em `goal-history.json`.)
   ```

9. **Sugestão de handoff.** Se alguma coisa virou fora do caminho neste ciclo,
   oferecer: "Quer que eu rode `find-my-bottlenecks` para ver se há um padrão
   entre metas? Ou passar a métrica de meta fora do caminho para eu cutucar o responsável?"

10. **Adicionar a `outputs.json`** com `type: "goal-snapshot"`,
    status "ready".

## Saídas

- `goal-history.json` atualizado
- `config/goals.json` atualizado (valores atuais atualizados + estado por
  objetivo + motivo por métrica de meta para em risco / fora do caminho)
- Adiciona a `outputs.json` com `type: "goal-snapshot"`.

## O que eu nunca faço

- **Inventar valor de métrica de meta**  -  se nenhuma fonte estiver disponível, parar e
  dizer quais responsáveis acionar.
- **Fixar limite de risco**  -  20 pontos percentuais = padrão
  documentado; sobrescritas por métrica de meta vivem em `config/goals.json`.
- **Modificar definições de metas silenciosamente**  -  se o usuário adicionar um novo
  objetivo pelo chat, confirmar o formato antes de escrever.
