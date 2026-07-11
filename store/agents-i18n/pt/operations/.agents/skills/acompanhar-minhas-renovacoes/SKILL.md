---
name: acompanhar-minhas-renovacoes
title: "Acompanhar minhas renovações"
description: "Pare de ser pego de surpresa pelas renovações automáticas. Eu vasculho seus contratos e qualquer drive conectado em busca de datas de renovação, prazos de aviso prévio e cláusulas de renovação automática, e depois mantenho um calendário de renovações vivo, agrupado por nível de antecedência, para que você sempre saiba o que vem a seguir. Também produzo um resumo trimestral com candidatos a negociação e tudo o que já passou do prazo de cancelamento."
version: 1
category: Operações
featured: no
image: clipboard
integrations: [googledrive]
---


# Acompanhar Minhas Renovações

Manter o arquivo mais crítico do agente: `renewals/calendar.md`. Lido pelo agente durante `run-my-ops-review period=weekly`.

## Quando usar

- "monte meu calendário de renovações" / "atualize o calendário de renovações".
- "o que está renovando nos próximos 90 dias / neste trimestre".
- "rode a varredura de renovações".
- Chamada como sub-etapa de `read-a-contract` depois de processar um contrato  -  a skill sugere `track-my-renewals` para atualizar o calendário com a nova entrada.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar eu verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Arquivos** (Google Drive)  -  Opcional. Me permite pegar contratos que você guardou fora do agente.
- **Cobrança** (Stripe)  -  Opcional. Mostra ferramentas sem contratos formais para que assinaturas não passem despercebidas.

Esta skill funciona com contratos que já estão no agente. Conexões opcionais ampliam a rede.

## Informações que eu preciso

Eu leio primeiro o seu contexto operacional. Para cada campo obrigatório que estiver faltando eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Postura com fornecedores**  -  Obrigatório. Por que preciso: define os níveis de antecedência (conservadora antecipa tudo). Se faltando eu pergunto: "Como você lida com fornecedores  -  de forma conservadora, equilibrada, ou rápida?"
- **Contratos existentes**  -  Obrigatório. Por que preciso: eu não consigo acompanhar renovações de contratos que eu não vi. Se faltando eu pergunto: "Envie seus contratos assinados, ou me aponte para a pasta onde eles vivem. O melhor é conectar o Google Drive."
- **Postura de aprovação**  -  Opcional. Por que preciso: me deixa saber quem pode assinar e o quão agressivamente mostrar candidatos a negociação. Se você não tiver isso eu sigo com A DEFINIR usando padrões de somente o fundador.

## Passos

1. **Ler `context/operations-context.md`**  -  vetos + postura com fornecedores definem o limite da sinalização "negociar antes de renovar automaticamente". Faltando: parar, pedir para rodar `set-up-my-ops-info`.

2. **Ler `config/procurement.json`**  -  especialmente `approvalPosture` (o apetite de risco ajusta os níveis de antecedência: conservador = antecedência maior, rápido = antecedência menor).

3. **Localizar os contratos.**

   - **contracts/**  -  todo arquivo é extração de cláusulas. Processar para extrair data de renovação + prazo de aviso prévio + presença de renovação automática.
   - **Drive conectado**  -  se `contractRepository.kind = "connected-storage"`, rodar `composio search drive` → listar arquivos → verificar se há algum ainda não presente em `contracts/` (chamar `read-a-contract` como sub-etapa para os novos  -  ou mostrar como "não processados: rode read-a-contract primeiro" para o usuário).
   - **Provedor de cobrança**  -  `composio search billing` → listar assinaturas com datas de renovação. Usar apenas para ferramentas sem contratos formais.

4. **Extrair dados por entrada.**

   Por contrato/assinatura: `{ vendor, amount_if_known, nextRenewalDate, noticeWindowDays, autoRenew, contractPath, source }`.

5. **Calcular o nível de antecedência por entrada** (dias até a renovação):
   - **7 dias**  -  urgente; se autoRenew e já passou o prazo de aviso, sinalizar "renovação iminente  -  não é possível parar".
   - **30 dias**  -  quente; fundador decide agora.
   - **60 dias**  -  morno; janela de negociação aberta.
   - **90 dias**  -  frio; janela de avaliação.
   - **além disso**  -  arquivado.

   Ajustes de apetite de risco vindos de `procurement.json`:
   - conservador → subir tudo um nível.
   - rápido → deixar nos padrões.

6. **Escrever `renewals/calendar.md`** de forma atômica. Arquivo VIVO  -  sobrescrito a cada vez.

   Estrutura:

   ```markdown
   # Renewal Calendar

   _Last scan: {ISO-8601} · Contracts scanned: {N}_

   ## Next 7 days ({M})
   - {Vendor} · {YYYY-MM-DD} · auto-renew:{Y/N} · notice-window-passed:{Y/N} · amount:{$if known} · path:{contracts/...md}

   ## Next 30 days ({M})
   ...

   ## Next 90 days ({M})
   ...

   ## Beyond 90 days ({M})
   ...
   ```

   Dentro de cada nível, ordenar por data crescente.

   **Arquivo NÃO indexado em `outputs.json`.** Documento vivo.

7. **Produzir o resumo trimestral** se solicitado (modo "quarterly") ou se estiver a até 14 dias do fim do trimestre. Salvar em `renewals/{YYYY-QN}-digest.md`:

   - **Próximas neste trimestre**  -  lista ordenada.
   - **Já passaram do prazo de aviso para cancelamento**  -  se houver, destacadas separadamente.
   - **Principais candidatos a negociação**  -  2 a 3 renovações onde os termos do contrato + a postura do fundador sugerem espaço para negociar (por exemplo, compromissos anuais com descompasso de uso).
   - **Candidatos a ajuste de escopo**  -  ferramentas pouco usadas mas renovando.

   Arquivo É indexado em `outputs.json` com `type: "renewal-digest"`.

8. **Escritas atômicas**  -  `*.tmp` → renomear.

9. **Adicionar a `outputs.json`** com `type: "renewal-digest"` somente em execuções de resumo. Atualizações do calendário não adicionam.

10. **Resumir para o usuário**  -  "N contratos escaneados. M renovando nos próximos 30 dias. Uma para agir primeiro: {vendor}  -  {motivo}. Abra renewals/calendar.md para a lista completa."

## Saídas

- `renewals/calendar.md` (vivo, NÃO indexado)
- `renewals/{YYYY-QN}-digest.md` (indexado, apenas execuções de resumo)
- Adiciona a `outputs.json` com `type: "renewal-digest"` (apenas execuções de resumo).

## O que eu nunca faço

- **Renovar automaticamente ou cancelar em nome do fundador.** Mostrar e sinalizar; o fundador age.
- **Contatar fornecedores.** O contato para renovação é trabalho de `draft-a-message` (type=vendor) e ainda precisa de aprovação do fundador.
- **Pular contrato não processado no drive conectado.** Se encontrado, mostrar ("3 contratos ainda não processados  -  rode `read-a-contract` em: {lista}") em vez de ignorar silenciosamente.
