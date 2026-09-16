---
name: profile-my-customer
description: "Build a detailed profile of the customer you're trying to win. I pull from your CRM or what you paste, and give you a persona with jobs-to-be-done, ranked pains, buying triggers, objection patterns, and real anchor accounts. Every ad, landing page, and email I write pulls from here."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [hubspot, salesforce, attio]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Profile My Customer

Source template: Gumloop "Market Segmentation: Buyer Persona Pain Point Report". Adapted for solo founder running everything alone.

## When to use

- "profile our ideal customer" / "build a persona for {segment}" / "help me nail buyer persona for {role}".
- "going upmarket, redo persona" / "SMB persona changed, update it".
- "build a persona from closed-won accounts" / "pull from my CRM, not vibes" / "who's actually buying this  -  look at closed-won".
- Called implicitly when another skill (e.g. `plan-a-campaign`, `set-up-my-marketing-info`) needs more persona depth than `config/ideal-customer.json` provides.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing -> I name the category, ask you to connect it from the Integrations tab, stop.

- **CRM (HubSpot, Salesforce, Attio)**  -  pull top closed-won and lost accounts so the persona is grounded in who actually buys. Required if you want me to infer the persona, optional if you'd rather paste.
- **Meeting notes (Gong, Fireflies, Circleback)**  -  verbatim pains, objections, and triggers. Optional but lifts the persona quality a lot.
- **Web search and scrape (Exa, Perplexity, Firecrawl)**  -  fill in role definitions, market reports, and common workflows. Optional.

If you want a CRM-grounded persona and no CRM is connected, I stop and ask you to connect HubSpot, Salesforce, or Attio (or paste the top accounts).

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning**  -  Required. Why I need it: persona work is wasted without a positioning anchor. If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes."
- **The segment to profile**  -  Required. Why I need it: one persona per run, I don't want to build the wrong one. If missing I ask: "Which segment are we profiling, your core ideal customer or a new one? A short description works, or point me at your CRM."
- **Top accounts to learn from**  -  Required. Why I need it: I won't invent demographics. If missing I ask: "Connect your CRM so I can pull your closed-won list, or paste five accounts (won or target) you want me to learn from."

## Steps
<!-- houston-workflow:v1 -->

1. **Read positioning doc** (own file, since this is HoM): `context/marketing-context.md`. If missing, run `set-up-my-marketing-info` first  -  persona work wasted without positioning anchor.

2. **Read config.** `config/ideal-customer.json`, `config/company.json`. If ideal customer config thin and user hasn't named segment, ask ONE targeted question: "Which segment are we profiling  -  your core ideal customer or a new one?" (Best modality: paste line, or point at connected CRM via Composio so I infer from top accounts.)

3. **Gather evidence.** Priority order:
   - Existing `call-insights/` under this agent root  -  verbatim customer language is gold.
   - Connected CRM via `composio search crm`  -  top closed-won and lost accounts matching segment.
   - Connected meeting-notes app via `composio search meeting-notes`.
   - Web research via `composio search web-search` or `composio search research`  -  market reports, role definitions, common workflows.
   - Founder-pasted notes.

4. **Draft persona (markdown, ~400-600 words).** Structure:

   1. **Segment name + one-line summary** (e.g. "Series-B RevOps leads at 50-200-person B2B SaaS").
   2. **Demographics / firmographics**  -  industry, size, stage, geography, role, seniority, reports-to.
   3. **Jobs-to-be-done**  -  2-4 jobs they hire product like ours for. Verbatim language where possible.
   4. **Pains**  -  ranked by intensity + frequency. Cite source (call quote, CRM close-loss reason, research report).
   5. **Triggers**  -  signal patterns making persona live buyer now (hiring role, switching tool, funding event, compliance deadline).
   6. **Anchor accounts**  -  3-5 real companies fit, ideally 1-2 already customers. Name them.
   7. **Objection patterns**  -  top 3 objections this persona raises, best one-line response each.
   8. **Buying process**  -  who initiates, who blocks, who signs, typical cycle length, typical committee size.
   9. **Where they hang out**  -  communities, newsletters, podcasts, conferences  -  actionable for social calendar + community plays.
   10. **Copy hooks**  -  3-5 short lines pattern-match this persona's language. Reused by content, lifecycle email, and social drafts.

5. **Mark UNKNOWN, don't guess.** Every section with insufficient evidence gets `UNKNOWN  -  {what would resolve it}` note. No invented demographics.

6. **Update `config/ideal-customer.json` if persona sharpens default ideal customer.** Atomic write. Ask user before overwriting, unless they said "update the ideal customer".

7. **Write atomically** to `personas/{segment-slug}.md`  -  write `{path}.tmp`, then rename.

8. **Append to `outputs.json`.** Read existing array, append new entry, write atomically:

   ```json
   {
     "id": "<uuid v4>",
     "type": "persona",
     "title": "<Segment name>",
     "summary": "<2-3 sentences  -  who they are, top pain, top trigger>",
     "path": "personas/<slug>.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

9. **Summarize to user.** One paragraph: segment one line, top pain + top trigger, biggest gap in persona (what to research next), path to artifact.

## Outputs

- `personas/{segment-slug}.md`
- Appends to `outputs.json` with `type: "persona"`.
- May update `config/ideal-customer.json` (with user approval).
