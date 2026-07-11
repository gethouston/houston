---
name: criar-o-perfil-de-um-funcionario
title: "Criar o perfil de um funcionário"
description: "Reúno tudo o que sei sobre um funcionário em uma única página: perfil de RH, plano de onboarding, check-ins recentes e histórico do processo de entrevistas. Útil antes de uma reunião 1:1, uma conversa sobre remuneração ou uma reunião difícil."
version: 1
category: Pessoas
featured: no
image: busts-in-silhouette
integrations: [notion, slack, loops]
---


# Criar o Perfil de um Funcionário

## Quando usar

- Explícito: "me conte sobre {funcionário}", "traga tudo sobre {funcionário}", "me prepare para meu 1:1 com {funcionário}", "dossiê sobre {funcionário}".
- Implícito: acionado antes de um ciclo de avaliação, uma conversa sensível (plano de melhoria de desempenho, promoção, mudança salarial) ou uma entrevista de desligamento.
- Frequência: sob demanda, por funcionário.

## Conexões que preciso

Faço o trabalho externo pelo Composio. Antes de rodar esta habilidade, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu nomeio a categoria, peço para você conectá-la na aba Integrações e paro.

- **Plataforma de RH (Gusto, Deel, Rippling, Justworks)** , ler cargo, nível, tempo de casa, gestor, remuneração, autorização de trabalho. Obrigatório.
- **Chat (Slack)** , buscar contexto recente de threads, se relevante. Opcional.
- **Documentos (Notion)** , buscar notas de avaliação ou documentos de 1:1, se você os mantém lá. Opcional.
- **Caixa de entrada (Loops)** , buscar comunicações recentes, se útil. Opcional.

Se a sua plataforma de RH não estiver conectada, eu paro e peço para você conectar Gusto, Deel, Rippling ou Justworks na aba Integrações.

## Informações que preciso

Primeiro leio o seu contexto de pessoas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar texto) e espero.

- **Identidade do funcionário** , Obrigatório. Por que preciso: não busco um dossiê de alguém que eu não consiga identificar com precisão. Se estiver faltando, pergunto: "Qual funcionário, nome completo, e o time, se você tiver essa informação?"
- **Autorização para ver campos confidenciais** , Obrigatório quando dados de remuneração ou visto forem solicitados. Por que preciso: eu nunca vazo a remuneração ou o status de um funcionário para outro sem essa autorização. Se estiver faltando, pergunto: "Esse dossiê deve incluir detalhes de remuneração e autorização de trabalho, ou só cargo e tempo de casa?"
- **Fonte da equipe atual** , Obrigatório quando a plataforma de RH não estiver conectada. Por que preciso: preciso de algum lugar para ler as informações básicas. Se estiver faltando, pergunto: "Conecte sua plataforma de RH para eu buscar isso diretamente, ou cole o registro do funcionário."

## Passos

1. **Leio o documento de contexto de pessoas.** Leio `context/people-context.md` para as regras de nivelamento, faixas salariais, confidencialidade em torno do conteúdo do dossiê. Se estiver faltando ou vazio, aviso o usuário: "Preciso primeiro do documento de contexto de pessoas, rode a habilidade set-up-my-people-info." Paro.
2. **Leio a configuração.** `config/context-ledger.json`. Se a plataforma de RH não estiver conectada e não houver link de equipe registrado, faço UMA pergunta direcionada com dica de modalidade: "Conecte sua plataforma de RH (Gusto, Deel, Rippling ou Justworks) na aba Integrações, ou cole o registro do funcionário." Registro a resolução, continuo.
3. **Confirmo a autorização.** Confirmo que quem solicitou está autorizado a ver dados confidenciais desse funcionário. Nunca revelo dados confidenciais de um funcionário (remuneração, desempenho, saúde, imigração) para outro sem autorização explícita.
4. **Descubro a ferramenta da plataforma de RH** , rodo `composio search hris` para o identificador de perfil somente leitura. Busco: cargo, nível, tempo de casa, gestor, localização, remuneração (se autorizado), status de autorização de trabalho / visto (se autorizado), data de início.
5. **Buscas em fontes locais (somente leitura).**
   - `onboarding-plans/{employee-slug}.md` , se este agente fez o onboarding dessa pessoa. Passo os olhos nos acertos e falhas do Dia-30/60/90.
   - `checkins/` , varro os check-ins mais recentes que referenciam esse identificador de funcionário.
   - `retention-scores/` , pontuação mais recente para esse identificador de funcionário.
   - `interview-loops/{employee-slug}.md` , se essa pessoa foi candidata no passado, busco o sinal do debriefing do painel.
   - Se algum diretório de agente irmão estiver ausente (instalação avulsa), pulo em silêncio, anoto "N/A , agente irmão não instalado" no dossiê.
6. **Componho o dossiê** com quatro seções:
   - **Perfil** , nome, cargo, nível, tempo de casa, gestor, localização, status de autorização de trabalho (se autorizado).
   - **Histórico** , trajetória de contratação (recrutador → proposta → início), destaques do onboarding, mudanças de nível, mudanças salariais (se autorizado).
   - **Sinais recentes** , temas de 1:1 dos últimos N check-ins, pontuação de retenção e tendência, aprovações recentes que passaram por este agente.
   - **Próximos passos** , próxima data de avaliação, vencimento de visto (se houver), penhasco de vesting (se houver), próximo marco do plano de onboarding.
7. **Escrevo** o dossiê de forma atômica em `dossiers/{employee-slug}.md` (`*.tmp` → renomeação). Mantenho em uma única página, fácil de folhear.
8. **Adiciono a `outputs.json`** , leio o array existente, adiciono `{ id, type: "dossier", title, summary, path, status: "draft", createdAt, updatedAt }`. Escrita atômica.
9. **Resumo para o usuário** , um parágrafo com o sinal principal (tempo de casa + pontuação de retenção + próximo marco) e o caminho do material.

## Nunca

- Nunca modifico registros da plataforma de RH / folha de pagamento. Apenas leitura.
- Nunca invento tempo de casa, remuneração ou dados de desempenho. Se a fonte estiver ausente, marco como DESCONHECIDO.
- Nunca vazo dados confidenciais de um funcionário para outro sem autorização explícita.

## Saídas

- `dossiers/{employee-slug}.md`.
- Adição em `outputs.json` com tipo `dossier`.
