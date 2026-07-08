---
name: rastrear-prazos-de-compliance
title: "Rastrear prazos de compliance"
description: "Mantenho um calendário vivo de compliance de pessoas: status dos formulários I-9 e W-4, renovações de visto, prazos de vesting, datas do ciclo de avaliações e a frequência de atualização das políticas. Verifico o seu sistema de RH, atualizo o calendário diretamente e te aviso antes que algo vença."
version: 1
category: Pessoas
featured: no
image: busts-in-silhouette
integrations: [googlesheets, notion]
---


# Rastrear Prazos de Compliance

## Quando usar

- Explícito: "monte o calendário de compliance", "o que está chegando em compliance de RH", "quais renovações de I-9 / W-4 / visto estão vencendo", "atualize o calendário de compliance".
- Implícito: acionado mensalmente, ou quando um novo funcionário termina o onboarding (novo prazo de I-9), ou quando uma data de visto é registrada.
- Frequência: sob demanda, mais atualização mensal.

## Conexões que preciso

Faço o trabalho externo pelo Composio. Antes de rodar esta habilidade, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu nomeio a categoria, peço para você conectá-la na aba Integrações e paro.

- **Plataforma de RH (Gusto, Deel, Rippling, Justworks)** , buscar datas de início, autorização de trabalho, vesting. Obrigatório.
- **Agenda (Google Calendar, Outlook)** , enviar lembretes de datas, se você quiser tê-los na sua agenda. Opcional.
- **Planilhas (Google Sheets, Airtable)** , espelhar o calendário para finanças ou operações, se necessário. Opcional.
- **Documentos (Notion)** , compartilhar o calendário no workspace do seu time. Opcional.

Se a sua plataforma de RH não estiver conectada, eu paro e peço para você conectar Gusto, Deel, Rippling ou Justworks na aba Integrações.

## Informações que preciso

Primeiro leio o seu contexto de pessoas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar texto) e espero.

- **Equipe atual com datas de início e status** , Obrigatório. Por que preciso: toda entrada remete a um registro de funcionário. Se estiver faltando, pergunto: "Conecte sua plataforma de RH para eu buscar datas de início e autorização de trabalho, ou cole a lista do time com esses campos."
- **Ritmo do ciclo de avaliação** , Obrigatório. Por que preciso: os marcos do ciclo de avaliação fazem parte do calendário. Se estiver faltando, pergunto: "As avaliações são anuais, semestrais ou trimestrais, e quando começa o próximo ciclo?"
- **Presença de registro estadual** , Opcional. Por que preciso: os registros estaduais dependem de onde os funcionários moram. Se você não tiver isso, sigo com "a definir" nas entradas estaduais.
- **Política de vesting de equity** , Opcional. Por que preciso: as datas de penhasco e aceleração determinam avisos de 30 dias. Se você não tiver isso, sigo com "a definir" nas entradas de equity.
- **Data de renovação de PTO** , Opcional. Por que preciso: ancora a entrada anual de renovação de PTO. Se você não tiver isso, sigo com "a definir".

## Passos

1. **Leio o documento de contexto de pessoas.** Leio `context/people-context.md` para o ritmo do ciclo de avaliação (anual / semestral / trimestral, data do próximo ciclo) e qualquer frequência de atualização de políticas. Se estiver faltando ou vazio, aviso o usuário: "Preciso primeiro do documento de contexto de pessoas, rode a habilidade set-up-my-people-info." Paro.
2. **Leio a configuração.** `config/context-ledger.json` (plataforma de RH somente leitura, nunca modifico registros). Se a plataforma de RH não estiver conectada, faço UMA pergunta direcionada com dica de modalidade ("Conecte sua plataforma de RH, Gusto, Deel, Rippling ou Justworks, na aba Integrações para eu poder buscar datas de início, status de autorização de trabalho e cronogramas de vesting").
3. **Descubro ferramentas pelo Composio.** Rodo `composio search hris` para o identificador de perfil somente leitura, mais `composio search calendar` para a ferramenta de agenda, para enviar lembretes se o usuário quiser.
4. **Varro os registros de funcionários (somente leitura).** Por funcionário, busco:
   - Data de início (referência da regra dos 3 dias do I-9).
   - Data da última atualização do W-4.
   - Vencimento de autorização de trabalho / visto (se aplicável).
   - Início do vesting de equity, data de penhasco e termos de aceleração (se aplicável).
   - Data-âncora do ciclo de avaliação em relação ao ritmo do contexto de pessoas.
5. **Produzo entradas de calendário por categoria:**
   - **Prazos de I-9** , regra dos 3 dias. Sinalizo qualquer pessoa ainda dentro da janela de 3 dias.
   - **Momento de atualização do W-4** , âncoras de atualização anual.
   - **Vencimentos de visto** , avisos de 90 / 60 / 30 dias por funcionário.
   - **Exigências de registro estadual** , obrigações por estado, a partir de contratações em novos estados.
   - **Datas do ciclo de avaliação** , derivadas do ritmo no contexto de pessoas.
   - **Penhascos de vesting de equity** , aviso 30 dias antes do penhasco.
   - **Datas de renovação da política de PTO** , renovação anual / do ano fiscal.
6. **Atualizo o documento vivo.** Escrevo o calendário completo e atualizado de forma atômica em `compliance-calendar.md` na raiz do agente (NÃO em subpasta), escrevo `compliance-calendar.md.tmp`, renomeio por cima do arquivo existente. Estrutura: uma seção por categoria acima, entradas ordenadas por data crescente, cada entrada carregando `{ employee-slug (se aplicável), due-date, days-out, action }`. Linha "Atualizado em: {timestamp}" no topo do arquivo.
7. **Adiciono a `outputs.json`** , leio o array existente, adiciono uma nova entrada por atualização: `{ id, type: "compliance", title: "Compliance calendar refresh {YYYY-MM-DD}", summary, path: "compliance-calendar.md", status: "ready", createdAt, updatedAt }`. Cada atualização substancial é uma NOVA entrada em outputs.json, o arquivo na raiz do agente é sobrescrito, mas o registro de outputs é somente-adição, então o painel mostra o histórico. Escrita atômica.
8. **Resumo para o usuário** , um parágrafo: quantidade de entradas por categoria, ação mais próxima no tempo, caminho para `compliance-calendar.md`. Ofereço enviar lembretes de datas para a ferramenta de agenda conectada.

## Nunca invento

Toda entrada remete a um registro real da plataforma de RH ou a uma âncora real do contexto de pessoas. Campo faltando? Marco como "a definir". Não chuto datas.

## Nunca modifico

Registros da plataforma de RH / folha de pagamento são somente leitura a partir deste agente. A habilidade lê, varre, produz o calendário em markdown, nunca escreve de volta na plataforma de RH.

## Saídas

- `compliance-calendar.md` na raiz do agente (documento vivo, atualizado no lugar de forma atômica).
- Adição em `outputs.json` com tipo `compliance` por atualização, o painel mostra o histórico de atualizações mesmo com o arquivo do calendário sendo sobrescrito.
