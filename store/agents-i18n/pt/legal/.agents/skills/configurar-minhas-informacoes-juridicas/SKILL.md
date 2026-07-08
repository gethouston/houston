---
name: configurar-minhas-informacoes-juridicas
title: "Configurar minhas informações jurídicas"
description: "Me conte o básico sobre a sua empresa para que eu possa te dar uma assessoria jurídica melhor. Eu faço algumas perguntas rápidas sobre a sua entidade, o cap table, os contratos vigentes, os modelos e quaisquer riscos em aberto. Você só precisa fazer isso uma vez, e eu mantenho tudo atualizado conforme as coisas mudam."
version: 1
category: Configuração
featured: yes
image: scroll
integrations: [googledocs, notion]
---


# Configurar minhas informações jurídicas

Este é o documento fundamental que este agente lê antes de qualquer tarefa relevante. A skill cria ou atualiza esse documento através de uma conversa rápida com o usuário.

## Quando usar

- "configurar meu contexto jurídico" / "elaborar o documento de contexto jurídico" / "montar o documento jurídico compartilhado".
- "atualizar o contexto jurídico" / "nosso cap table mudou, corrija o documento" / "acabamos de assinar o MSA da Acme, adicione aos contratos vigentes".
- Chamada implicitamente por qualquer outra skill que precise do contexto compartilhado quando o documento não existir, mas só depois de confirmar com o usuário.

## Passos

1. **Leia a configuração.** Carregue `config/entity.json`, `config/posture.json`, `config/templates.json`, `config/profile.json`. Se algo estiver faltando, pergunte APENAS a informação que falta, no momento certo, usando linguagem simples (ordem de preferência: app conectado > arquivo enviado > URL > texto colado).

2. **Leia o documento existente, se houver.** Se `legal-context.md` já existir, leia o conteúdo para que a execução seja uma atualização, não uma reescrita. Preserve as partes que o fundador já refinou; altere apenas o que estiver desatualizado ou for novo.

3. **Busque o cap table e os contratos vigentes, se as fontes estiverem conectadas.** Se houver uma ferramenta de cap table conectada (`composio search cap-table`, Carta / Pulley / outra), busque o retrato atual (participação do fundador, pool de opções, termos da rodada precificada), registrando a fonte e a data da última atualização. Nunca invente números. Se nada estiver conectado, peça ao fundador um resumo de uma linha e marque a fonte como `"self-reported"`.

4. **Faça o mínimo de perguntas, no momento certo.** A entrevista cobre apenas o que a configuração não respondeu:
   - Retrato do cap table (se não houver Carta/Pulley conectado): participação do fundador, pool de opções, termos da rodada precificada.
   - Contratos vigentes: resumos de clientes / fornecedores / contratados / investidores (1 linha cada, não o texto completo).
   - Riscos em aberto: 83(b) não protocolado? CIIAA não assinado? DPA vencido? propriedade intelectual de contratado sem documentação? Qualquer coisa que o fundador saiba que ainda está pendente.
   - Regras de escalonamento: qualquer coisa que o fundador queira que seja sempre escalada (por exemplo, "sempre sinalize negócios com ACV acima de US$ 50 mil").

5. **Redija o documento (cerca de 400 a 600 palavras, direto, com verbos de ação).** Estrutura, nesta ordem:

   1. **Entidade**: nome, estado, tipo de entidade, data de constituição, ações autorizadas, valor nominal, agente registrado, meio de constituição. Marque `TBD` para o que estiver faltando.
   2. **Retrato do cap table**: data da última atualização, fonte (Carta / Pulley / planilha / self-reported), participação do fundador, pool de opções, termos da rodada precificada (se houver).
   3. **Contratos vigentes**: lista com marcadores por categoria (clientes, fornecedores, contratados, investidores). Uma linha por contrato: contraparte, tipo, data de vigência, prazo / renovação automática, obrigações principais. Apenas um resumo, não o texto completo.
   4. **Conjunto de modelos**: referências aos modelos atuais de NDA / MSA / consultoria / oferta / DPA. Cada um com a versão e a data da última revisão. Marque `none` se o fundador não tiver modelo daquele tipo.
   5. **Riscos em aberto**: lista com marcadores. Cada um com a severidade (baixa / média / alta) e uma descrição de uma linha. Riscos de severidade `high` são escalados no painel.
   6. **Postura de risco do fundador**: posicionamento (agressivo / intermediário / conservador) e o detalhamento por cláusula vindo de `config/posture.json`. Mantenha literalmente as anotações do fundador, quando fornecidas.
   7. **Regras de escalonamento**: o que eu vou e não vou tratar sem um advogado humano. Piso padrão: qualquer coisa acima de US$ 100 mil de ACV, qualquer indenização fora do padrão, qualquer propriedade intelectual saindo, e qualquer célula `major × likely` na leitura 5x5 de severidade x probabilidade.

6. **Marque as lacunas com honestidade.** Se uma seção estiver rasa (sem cap table conectado, sem contratos vigentes ainda, riscos em aberto não entrevistados), escreva `TBD, {o que o fundador deveria trazer da próxima vez}` em vez de adivinhar. Nunca invente datas, ações ou contrapartes.

7. **Escreva de forma atômica.** Escreva em `legal-context.md.tmp` e renomeie para `legal-context.md`. Arquivo único na raiz do agente. NÃO em uma subpasta. NÃO em `.agents/`. NÃO em `.houston/<agent>/`.

8. **Adicione ao `outputs.json`.** Leia o array existente, adicione a nova entrada e escreva de forma atômica:

   ```json
   {
     "id": "<uuid v4>",
     "type": "legal-context",
     "title": "Contexto jurídico atualizado",
     "summary": "<2-3 frases, o que mudou nesta passada, por exemplo: adicionou o MSA da Acme aos contratos vigentes; mudou a postura para conservadora quanto à responsabilidade>",
     "path": "legal-context.md",
     "status": "ready",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

   (O documento em si é um arquivo vivo, mas cada edição relevante é indexada para que o fundador veja a atualização no painel. Publique como `ready`, já que o documento é um retrato factual, não um rascunho.)

9. **Resuma para o usuário.** Um parágrafo curto em linguagem simples: o que você já sabe, o que ainda está faltando, e a coisa mais útil a fazer a seguir (por exemplo, "Conecte o Carta e eu consigo manter seu cap table atualizado automaticamente"). Nunca cite caminhos de arquivo ou nomes internos de campos.

## Resultados

- `legal-context.md` (na raiz do agente, documento vivo)
- Inclui uma entrada em `outputs.json` com `type: "legal-context"`, `status: "ready"`.
