---
name: responder-a-um-questionario-de-seguranca
title: "Responder a um questionário de segurança"
description: "Um cliente grande te enviou um questionário de segurança? Eu leio, preencho tudo o que já sei sobre a sua empresa e agrupo o resto por tema para que você resolva várias de uma vez. Cada resposta que eu salvo é reaproveitada na próxima vez, então o segundo questionário é bem mais rápido que o primeiro."
version: 1
category: Conformidade
featured: no
image: scroll
integrations: [googlesheets, googledocs, googledrive, airtable]
---


# Responder a um Questionário de Segurança

## Quando usar

- Explícito: "me ajuda com esse questionário de segurança", "preencher a avaliação de segurança de fornecedor", "triagem desse SIG / CAIQ", "o que você consegue responder nesse questionário", "prospect corporativo me mandou esse documento de segurança".
- Implícito: `sort-my-legal-inbox` classificou algo recebido como "outro → questionário de segurança de fornecedor" e o fundador quer agir.
- Um questionário por execução. Vários → chame uma vez para cada um.

## O que isso é (e o que não é)

**Triagem + rascunho** , extração rápida do conjunto de perguntas, preenchimento automático a partir da biblioteca de respostas salvas do fundador, lista agrupada de "ainda precisa de você" para que uma única sentada resolva várias. **Não é** uma auditoria completa do programa de segurança, **não é** aprovação final. Toda saída termina com "isso é um resumo, não é consultoria jurídica; questionários de segurança corporativos às vezes implicam compromissos contratuais, escale para um advogado externo qualquer coisa com impacto comercial."

## A biblioteca de respostas

`config/security-answers.md` = biblioteca permanente e crescente de respostas do programa de segurança do fundador. Acumula com o tempo, cada novo questionário pode adicionar respostas. Markdown simples, títulos por tema + pares de pergunta/resposta:

```markdown
## Access control
**Q: Do you enforce MFA on all admin accounts?**
A: Yes  -  MFA required on all production infrastructure (AWS,
   {password-manager}, {git-host}) via {provider}. Enforced since
   {YYYY-MM}.

## Data at rest
**Q: Is customer data encrypted at rest?**
A: Yes  -  AES-256 at rest via {provider}'s managed encryption on all
   customer data stores.

...
```

Grupos de temas (personalize se o questionário for diferente): controle de acesso, autenticação, dados em repouso, dados em trânsito, residência de dados, subprocessadores, backups e recuperação de desastres, resposta a incidentes, ciclo de desenvolvimento seguro, gestão de vulnerabilidades, registro e monitoramento, segurança de pessoal (contratação / desligamento / treinamento), segurança física (geralmente "não se aplica, remoto, hospedado em {nuvem}"), certificações de conformidade (SOC 2, ISO, HIPAA, GDPR), IA / treinamento de modelos, acesso da equipe de suporte aos dados de clientes, retenção e exclusão de dados.

## Passos

1. **Leia o contexto compartilhado**: `context/legal-context.md`. Se estiver faltando ou vazio, pergunte ao usuário em linguagem simples: "Preciso saber algumas informações básicas sobre a sua empresa antes de responder isso bem. Quer configurar isso agora?" Depois execute `set-up-my-legal-info` se sim. Pare até que isso esteja feito. Extraia o nome da entidade, a geografia dos dados, os contratos vigentes com clientes corporativos que possam limitar as respostas.
2. **Leia a biblioteca de respostas**: `config/security-answers.md`. Se estiver faltando, é o primeiro questionário, tudo bem, a biblioteca começa a partir das respostas capturadas aqui. Anote na saída quantas respostas anteriores você já tem em mãos.
3. **Localize o questionário.** Aceite: (a) texto colado, (b) caminho de arquivo (PDF, DOCX, XLSX, CSV), (c) URL ou ponteiro para um armazenamento de documentos conectado, (d) link do Google Sheets / Airtable. Se uma ferramenta de armazenamento de documentos ou planilhas estiver conectada, descubra por meio de qualquer categoria de armazenamento de documentos ou planilhas conectada via Composio, busque. Se nada foi fornecido, faça UMA pergunta: "Cole o questionário, envie o arquivo, ou me aponte para ele no seu armazenamento de documentos."
4. **Analise.** Extraia o conjunto de perguntas em um array estruturado: `{ id, section, question, expectedFormat? }`. `id` = hash estável de `seção + texto da pergunta` para que reexecuções não renumerem. `expectedFormat` captura o formato esperado da resposta quando evidente ("Sim/Não", "Texto livre", "Sim/Não + comentário", "Anexo de documento"). Se a análise falhar (PDF escaneado, PDF travado, apenas imagem) → avise o usuário, peça uma versão com texto extraível. Não adivinhe.
5. **Preencha automaticamente a partir da biblioteca de respostas.** Para cada pergunta, compare com `config/security-answers.md`:
   - **Correspondência exata** , pergunta/resposta anterior com sobreposição de termos ≥ 90%, mesmo tema → preencha, marque a origem como `"library-exact"`.
   - **Correspondência próxima** , pergunta/resposta anterior do mesmo tema, semanticamente equivalente → preencha, marque como `"library-near"`, sinalize para conferência rápida do fundador.
   - **Sem correspondência** , deixe em branco, marque como `"needs-founder"`.
6. **Agrupe o que não foi respondido por tema.** Use a lista de grupos de temas acima. Objetivo: uma única sentada responder o máximo possível de `needs-founder`. Dentro de cada tema, os Sim/Não mais simples primeiro, vitórias rápidas.
7. **Redija o documento de resposta.** Grave em `security-questionnaires/{counterparty-slug}-{YYYY-MM-DD}.md` de forma atômica (`*.tmp` → renomear). Estrutura:
   - Cabeçalho: contraparte, tipo de questionário (SIG-lite / CAIQ / personalizado / etc.), total de perguntas, total preenchido, total que precisa do fundador, correspondências próximas que precisam de conferência.
   - **Respostas preenchidas** , agrupadas por tema, cada uma mostra a pergunta, a resposta, a marca de origem (`library-exact` / `library-near`). Correspondências próximas recebem um aviso de uma linha "confira se isso ainda vale".
   - **Ainda precisa de você** , agrupado por tema, numerado para facilitar as respostas no chat. Inclua o formato de resposta sugerido (Sim/Não, parágrafo curto, anexar documento de política).
   - Rodapé: "Isso é um resumo, não é consultoria jurídica. Algumas respostas em questionários de segurança criam compromissos contratuais reais. Se algo tiver impacto comercial sério, peça para eu preparar um resumo para um advogado externo."
8. **Escreva uma lista curta.** Também produza uma lista curta (no máximo 10 itens) de "precisa de você agora", o conjunto mínimo que desbloqueia o retorno do rascunho. Coloque no topo do documento de resposta e no resumo para o usuário.
9. **Capture novas respostas conforme o fundador responde.** Depois que o fundador responder no chat, adicione/atualize `config/security-answers.md` de forma atômica:
   - Novo tema + pergunta/resposta → adicione sob o título do tema.
   - Pergunta/resposta existente que o fundador atualizou → substitua a resposta, anote `(atualizado em {YYYY-MM-DD})` no texto.
   - Nunca descarte respostas anteriores sem a confirmação explícita do fundador.
   Atualize o documento de resposta com as respostas recém-capturadas, reclassifique como `library-exact` daqui para frente.
10. **Adicione ao `outputs.json`** , leia o array existente, adicione `{ id, type: "security-questionnaire", title, summary, path, status: "draft", createdAt, updatedAt, attorneyReviewRequired }`. Defina `attorneyReviewRequired: true` se o questionário contiver qualquer pergunta que implique compromisso contratual (SLAs de notificação de violação, SLAs de disponibilidade, compromissos de residência de dados, direitos de auditoria, indenizações, mínimos de seguro), essas não devem ser respondidas sem revisão de um advogado externo.
11. **Resuma para o usuário.** Linguagem simples. Um parágrafo curto: "O questionário de {contraparte} tem {total} perguntas. Preenchi {N} com o que já sei sobre a sua empresa ({M} precisam de uma conferência rápida). {K} perguntas precisam de você. Quer resolver a seção de {tema} primeiro?" Nunca cite nomes de arquivos ou caminhos.

## Nunca inventar

- Nunca invente um controle de segurança que o fundador não confirmou. "Não" ou "Ainda não" é a resposta certa até o fundador implementar, um "Sim" falso é como fundadores acabam violando contratos que nem sabiam ter assinado.
- Nunca normalize respostas específicas. Fundador diz "Postgres no RDS, criptografado" → o documento de resposta diz "Postgres no RDS, criptografado", não "banco de dados gerenciado padrão do setor com criptografia em repouso." A especificidade importa para compradores corporativos e auditorias futuras.
- Nunca amenize com "provavelmente" ou "possivelmente". Declare a resposta ou marque como `needs-founder`.

## Proibições absolutas

- Nunca envia, compartilha, ou devolve o questionário para a contraparte. Todo rascunho é para o fundador revisar e enviar.
- Nunca fornece consultoria jurídica que não esteja claramente marcada como resumo. A linha do rodapé é inegociável.
- Nunca compromete o fundador com um prazo, SLA, número de disponibilidade, cobertura de seguro, ou status de certificação sem a confirmação explícita do fundador.
- Nunca fixa nomes de ferramentas no código. As buscas de questionário passam por qualquer categoria de armazenamento de documentos ou planilhas conectada via Composio.
- Nunca trata a lista de grupos de temas como definitiva, tema novo no questionário → adicione ao agrupamento, anote na saída para que a biblioteca cresça.

## Saídas

- `security-questionnaires/{counterparty-slug}-{YYYY-MM-DD}.md` , rascunho de resposta + lista de pendências.
- Adiciona/atualiza `config/security-answers.md` , biblioteca permanente de respostas.
- Adiciona ao `outputs.json` com tipo `security-questionnaire`.
