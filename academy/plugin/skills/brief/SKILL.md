---
name: brief
description: Help a Houston Academy learner turn an idea into a one-page brief and slices (the Builder's Loop), without building anything. Use when the learner types /academy:brief, or when they ask for something huge ("the whole app", "GTA 6 but multiplayer") and agree to slice it first.
argument-hint: "[your idea, in one sentence]"
---

# Slice an idea into a brief

The learner's idea: **$ARGUMENTS** (if empty, ask for it in one sentence, "as big as it is").

Talk in the learner's language (`.academy/profile.json`, default English). Plain words, no code. **Don't build anything in this skill.**

## 1. Understand (max 5 questions)

Ask up to 5 short questions, all in one message, numbered, easy to answer. Cover:
- who it's for (one specific kind of person);
- the problem they have today, and how they solve it now;
- what would make that person say "this already helps";
- anything that must be true (a deadline, a tool they use, a language).

Wait for the answers.

## 2. Propose

Then propose, in plain words:

1. **The problem**, in one sentence.
2. **Who it's for**, in one sentence.
3. **The smallest useful version**, in one sentence: the least that would already help that person.
4. **3 to 6 slices, in order.** Each slice:
   - is something **a person can do** ("a customer can see the status of their order"), not a technical part ("the backend");
   - works from start to finish, even if it does very little (fake data is fine early, labeled as fake);
   - has a **"done when"** the learner can check themselves in about five minutes, without code.
5. What you are **leaving out on purpose** for now, so they see the big idea isn't lost.

Ask: "Does this match what you have in mind? What would you change?" Adjust until they're happy.

## 3. Save the brief

Write `brief.md` in the project folder, from the template for their language at the end of this skill ("Template: English" or "Template: Español"). If `brief.md` exists, update it, and keep slices that are already done marked as done.

## 4. Next step

Tell them, in 2–3 lines: the brief is saved; next is slice 1 only; when they're ready, they can say "build slice 1", and you'll share a short plan first. Remind them: one slice, test it, then the next.

## Template: English

````markdown
# Brief: {{PRODUCT NAME}}

_Last updated: {{DATE}}_

## The problem
{{One sentence: what's hard today, for whom.}}

## Who it's for
{{One specific kind of person.}}

## The smallest useful version
{{One sentence: the least that already helps them.}}

## Slices

| # | A person can… | Done when… (check it yourself, in ~5 minutes, no code) | Status |
|---|---|---|---|
| 1 | {{…}} | {{…}} | ⬜ next |
| 2 | {{…}} | {{…}} | ⬜ |
| 3 | {{…}} | {{…}} | ⬜ |

## Left out on purpose (for now)
- {{…}}

## What I learned from testing
- {{Notes from you and from the people who tried it, after each slice.}}
````

## Template: Español

````markdown
# Brief: {{NOMBRE DEL PRODUCTO}}

_Última actualización: {{FECHA}}_

## El problema
{{Una frase: qué es difícil hoy, y para quién.}}

## Para quién es
{{Un tipo específico de persona.}}

## La versión útil más pequeña
{{Una frase: lo mínimo que ya le ayuda.}}

## Rebanadas

| # | Una persona puede… | Listo cuando… (verifícalo tú, en ~5 minutos, sin código) | Estado |
|---|---|---|---|
| 1 | {{…}} | {{…}} | ⬜ sigue |
| 2 | {{…}} | {{…}} | ⬜ |
| 3 | {{…}} | {{…}} | ⬜ |

## Lo que dejamos por fuera a propósito (por ahora)
- {{…}}

## Lo que aprendí probando
- {{Notas tuyas y de las personas que lo probaron, después de cada rebanada.}}
````
