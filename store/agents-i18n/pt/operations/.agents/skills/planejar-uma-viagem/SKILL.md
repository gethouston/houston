---
name: planejar-uma-viagem
title: "Planejar uma viagem"
description: "Receba um pacote de viagem pronto para que você possa viajar sem largar o resto da sua semana. Eu monto um resumo da viagem, um roteiro com critérios de busca de voos e hotéis, e uma lista de itens para a mala adaptada ao destino e ao tipo de viagem. Me diga onde e quando; eu redijo, você reserva."
version: 1
category: Operações
featured: no
image: clipboard
integrations: [googlecalendar, gmail]
---


# Planejar Uma Viagem

## Quando usar

- "vou para {cidade}" / "planeje minha viagem para {X}" / "planeje uma viagem do início ao fim".
- "voos para {conferência}" / "tenho uma visita a cliente em {X}".
- "monte meu pacote de viagem".

## Conexões que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Agenda** (Google Calendar, Outlook) - Obrigatório. Me permite ver reuniões existentes durante a janela da viagem e puxar eventos no destino.
- **Caixa de entrada** (Gmail, Outlook) - Opcional. Me ajuda a encontrar confirmações de reserva ou roteiros existentes.
- **Provedores de viagem** (busca de voos ou hotéis) - Opcional. Se conectado, mostro opções reais; senão, escrevo os critérios de busca e você reserva sozinho.

Se nenhuma agenda estiver conectada, paro e peço para você conectar sua agenda primeiro.

## Informações que preciso

Leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Destino e datas** - Obrigatório. Por que preciso: nada funciona sem saber onde e quando. Se faltar, pergunto: "Para onde você vai e em quais datas? Um intervalo serve se você ainda estiver flexível."
- **Propósito da viagem** - Obrigatório. Por que preciso: uma visita a cliente, uma conferência, um offsite, e uma viagem pessoal recebem roteiros e listas de mala diferentes. Se faltar, pergunto: "Qual é o propósito da viagem, visita a cliente, conferência, offsite, ou pessoal?"
- **Preferências de viagem** - Obrigatório. Por que preciso: redijo com base nas suas preferências reais em vez de chutar. Se faltar, pergunto: "Quais são suas preferências padrão de viagem, companhia aérea preferida, assento, rede de hotel, necessidades alimentares, algo que eu deva sempre incluir?"
- **Seu fuso horário** - Opcional. Por que preciso: identifica conflitos de agenda durante a janela da viagem. Se você não tiver isso, sigo em frente com TBD usando o padrão do seu contexto operacional.

## Passos

1. **Leio `context/operations-context.md`.** Se faltar/estiver vazio, paro. Peço para o usuário rodar `set-up-my-ops-info` primeiro. Contatos-chave + prioridades ancoram a seção "quais reuniões enquanto estiver lá?".

2. **Esclareço a viagem.** Extraio da mensagem: destino(s), datas (ou intervalo), propósito (visita a cliente / conferência / offsite / pessoal), viajando com (sozinho / equipe). Se datas ou destino faltarem e forem relevantes, faço UMA pergunta.

3. **Leio as preferências de viagem.** Leio `config/travel-prefs.json`. Se faltar/estiver vazio, faço UMA pergunta: "Quais são suas preferências padrão de viagem, companhia aérea preferida, assento (corredor/janela), rede de hotel, necessidades alimentares, acessibilidade?" Escrevo a resposta em `config/travel-prefs.json`, continuo.

4. **Leio a agenda.** Leio `config/schedule-preferences.json` para o fuso horário. Verifico conflitos de agenda durante a janela da viagem via `composio search calendar` (puxo eventos da data de partida até a data de retorno).

5. **Resolvo as conexões de viagem.** `composio search travel` → verifico provedores de viagem conectados (busca de voos + hotéis). Anoto as categorias disponíveis. Se nenhuma estiver conectada, sigo apenas com os critérios de busca + anoto que o usuário reserva manualmente (sem assumir provedor fixo).

6. **Gero o id da viagem** - `{YYYY-MM-DD}-{dest-slug}` (destino em kebab-case, ex. `2026-05-12-sfo`).

7. **Escrevo `travel/{trip-id}/trip.md`** - documento de resumo. Estrutura:

   ```markdown
   # Viagem - {destino}, {datas}

   ## Propósito
   {1-2 linhas - visita a cliente / conferência / offsite / pessoal}

   ## Datas
   Partida {YYYY-MM-DD} - Retorno {YYYY-MM-DD} ({N noites})

   ## Destinos
   - {cidade}, {país/estado} - {noites}

   ## Reuniões-chave enquanto estiver lá
   - {data} - {participante ou evento} - preparação: {pronto | faltando}
   - ... (puxado da agenda conectada para eventos dentro da janela da viagem)

   ## Perguntas em aberto
   - {qualquer coisa que o usuário deva esclarecer antes de reservar}
   ```

8. **Escrevo `travel/{trip-id}/itinerary.md`.** Estrutura:

   ```markdown
   ## Voos

   ### Ida
   - Critérios de busca: {origem} → {destino}, {data},
     {preferência de companhia}, {preferência de assento}, {máx. de escalas}, {teto de preço se
     mencionado}
   - Opções candidatas (se um provedor estiver conectado): {lista}

   ### Volta
   - Critérios de busca: {destino} → {origem}, {data}, {mesmas preferências}
   - Opções candidatas: {lista}

   ## Hotéis
   - Critérios de busca: {preferência de rede}, {noites}, {bairro perto
     das reuniões-chave}, {teto de preço se mencionado}
   - Opções candidatas: {lista}

   ## Transporte terrestre
   - Aeroporto → hotel → reuniões
   - Modo preferido: {aplicativo de transporte / aluguel de carro / público}

   ## Reservas pendentes
   - [ ] Voo de ida
   - [ ] Voo de volta
   - [ ] Hotel
   - [ ] Transporte terrestre
   ```

9. **Escrevo `travel/{trip-id}/packing.md`** - lista adaptada ao clima do destino (melhor estimativa a partir do destino + datas; anoto a suposição), ao tipo de viagem (visita formal a cliente versus conferência versus offsite, roupas diferem), e a `config/travel-prefs.json` (alimentação, acessibilidade). Seções: `## Essenciais`, `## Trabalho`, `## Roupas`, `## Saúde e higiene`, `## Específico do destino`.

10. **Escritas atômicas** - `*.tmp` → renomear por arquivo.

11. **Adiciono a `outputs.json`** com `type: "travel-pack"`, status "draft" até o usuário aprovar as reservas.

12. **Resumo para o usuário.** "Pacote de viagem pronto em `travel/{trip-id}/`. Quer que eu procure opções de voo via {provedor-disponível} assim que você confirmar as datas, ou você vai reservar sozinho? Também, devo bloquear sua agenda durante a viagem?"

## Saídas

- `travel/{trip-id}/trip.md`
- `travel/{trip-id}/itinerary.md`
- `travel/{trip-id}/packing.md`
- Possivelmente `config/travel-prefs.json` escrito na primeira execução
- Adiciona a `outputs.json` com `type: "travel-pack"`.

## O que eu nunca faço

- **Reservar** voos, hotéis, transporte terrestre sem aprovação explícita do usuário sobre uma opção específica.
- **Cobrar** em qualquer cartão.
- **Assumir compromisso** com datas de viagem em seu nome.
- **Inventar** um evento no destino que não está na agenda nem foi nomeado pelo usuário.
