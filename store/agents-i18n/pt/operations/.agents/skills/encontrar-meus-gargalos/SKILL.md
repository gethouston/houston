---
name: encontrar-meus-gargalos
title: "Encontrar meus gargalos"
description: "Descubra o que está realmente travando sua empresa para que você possa destravar. Eu agrupo evidências das suas revisões recentes, decisões pendentes, anomalias em aberto e metas fora do trilho em gargalos nomeados, cada um com uma hipótese e um responsável proposto para destravá-lo. Use isso quando algo parecer travado e você não conseguir identificar o porquê."
version: 1
category: Operações
featured: no
image: clipboard
---


# Encontrar Meus Gargalos

## Quando usar

- O usuário pergunta "o que está travado," "o que está bloqueando o progresso," "por que não estamos avançando em X."
- A revisão semanal mais recente (deste agente) repete um risco ou pedido da anterior.
- Uma meta virou fora do trilho e a iniciativa vinculada também atrasou.

## Conexões que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Rastreador de projetos** (Linear, Notion, Asana) - Opcional. Revela iniciativas paradas e bloqueios no nível de tarefa; funciono sem isso, mas com menos sinal.
- **Chat da equipe** (Slack) - Opcional. Me permite captar pedidos que se repetem em diferentes conversas.

Esta habilidade funciona sem nenhuma conexão, apoia-se principalmente no que já está no seu trabalho salvo. Nunca bloqueio aqui.

## Informações que preciso

Leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Prioridades ativas** - Obrigatório. Por que preciso: um gargalo só importa se estiver bloqueando algo que você está priorizando. Se faltar, pergunto: "Quais são as 2 a 3 coisas que a empresa está priorizando neste trimestre?"
- **Contatos-chave** - Obrigatório. Por que preciso: proponho responsáveis para destravar; sem contatos eu estaria chutando nomes. Se faltar, pergunto: "Quem destrava o quê, engenharia, vendas, operações? Nomes mais como contatá-los."
- **Decisões, revisões ou registros de metas recentes** - Opcional. Por que preciso: mais trabalho salvo significa evidência mais forte. Se você não tiver isso, sigo em frente com TBD e me apoio no que existir.

## Passos

1. **Leio `context/operations-context.md`.** Se faltar ou estiver vazio, paro e peço para o usuário rodar `set-up-my-ops-info` primeiro. Prioridades e contatos-chave ancoram a lógica de "responsável proposto para destravar".

2. **Reúno evidências das últimas 4 semanas** (trato cada fonte como "se existir, uso; se faltar, continuo"):
   - `reviews/` - os arquivos das últimas 4 revisões semanais. Procuro riscos / pedidos que se repetem.
   - `triage/` - os arquivos das últimas 4 triagens de caixa de entrada. Conversas recorrentes de "pode esperar" da mesma pessoa sugerem um gargalo de delegação.
   - `decisions.json` - qualquer decisão com `status: "pending"` com mais de 14 dias → gargalo de latência de decisão.
   - `goal-history.json` - qualquer métrica de meta `off-track` em dois ou mais registros consecutivos → candidato a gargalo ligado à iniciativa vinculada.
   - `anomalies.json` deste agente - anomalias em aberto que se repetem sugerem um gargalo de dados ou de processo.

3. **Agrupo os temas recorrentes.** Agrupo as evidências por responsável compartilhado, dependência cruzada entre equipes compartilhada, ou meta compartilhada. Gargalo = agrupamento, não incidente isolado.

4. **Para cada agrupamento, formulo uma hipótese** (1 a 2 frases, nunca declarada como certeza):
   - "A contratação em engenharia está travada na agenda de entrevistas do fundador, 3 iniciativas esperando pelo mesmo revisor."
   - "Mudanças de preço bloqueadas por uma decisão pendente desde a semana de {data}, 2 lançamentos esperando por isso."
   - "Extrações de dados entre agentes duplicando trabalho, tanto o pacote para o conselho quanto a atualização para investidores pedindo a mesma consulta de retenção."

5. **Proponho um responsável para destravar.** Leio a seção de liderança / contatos-chave do contexto operacional. Para gargalos entre equipes, responsável = quem detém o recurso bloqueador (ex. o CTO para uma restrição na agenda de engenharia), não um executivo posterior na cadeia. Para fundador solo, responsável = o próprio fundador, o destrave proposto costuma ser "reservar tempo para {X}" ou "delegar {Y}".

6. **Quantifico o impacto.** Listo `impactOnGoalIds` (objetivos bloqueados) e `impactOnInitiativeSlugs` (iniciativas paradas). Mantenho as citações precisas, as strings de evidência referenciam caminhos reais (arquivos de revisão, slugs de decisão, ids de anomalia).

7. **Deduplico contra gargalos em aberto.** Leio `bottlenecks.json`. Se o agrupamento corresponder a uma linha em aberto já existente (mesmo responsável proposto + conjunto de impacto sobreposto), atualizo no lugar (adiciono nova evidência, refino a hipótese, atualizo `updatedAt`). NÃO crio duplicata.

8. **Roteamento de assuntos sensíveis.** Se a hipótese nomear uma pessoa específica como o gargalo (desempenho / capacidade), NÃO deixo essa linguagem em `bottlenecks.json`. Generalizo para linguagem de função e processo ("capacidade de entrevistas de engenharia") na linha do índice. Sinalizo os detalhes específicos ao CEO só no chat.

9. **Escrevo os gargalos novos / atualizados** em `bottlenecks.json` (atômico). Cada linha: `{ slug, title, hypothesis, proposedOwner, impactOnGoalIds, impactOnInitiativeSlugs, status: "open", evidence, createdAt, updatedAt }`.

10. **Adiciono a `outputs.json`** com `type: "bottleneck"`, status "ready" por linha nova.

11. **Repasse no chat.**

    ```
    {N} gargalo(s) identificado(s).

    1. **{título}** - responsável proposto: {responsável}.
       Hipótese: {hipótese}
       Bloqueia: {N} meta(s), {M} iniciativa(s).
       Evidência: {citações}

    2. ...

    Quer que eu redija um empurrão para {responsável proposto} sobre o #1?
    (Eu passaria isso para a habilidade `draft-a-message`.)
    ```

## Saídas

- `bottlenecks.json` adicionado / atualizado
- Adiciona a `outputs.json` com `type: "bottleneck"` por linha nova.

## O que eu nunca faço

- **Nomear uma pessoa como o gargalo** no JSON indexado, generalizo para função/processo, sinalizo os detalhes específicos em particular.
- **Declarar a hipótese como certeza** - só "provavelmente" / "o padrão sugere".
- **Redigir a mensagem de empurrão aqui** - repasso para `draft-a-message` (rascunhos na voz correta na caixa de entrada).
