---
name: set-up-my-sales-info
description: "Tell me the basics about your company, your ideal customer, your pricing stance, deal stages, and how you handle objections so I can give you better sales help. I ask a few quick questions and write the playbook every other skill reads first. You only need to do this once, and I keep it updated as things change."
version: 1
category: Sales
featured: yes
image: handshake
integrations: [googledocs, hubspot, salesforce, attio, pipedrive, notion]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Set Up My Sales Info

Skill OWNS `context/sales-context.md`. No other skill writes it.
Skill create or update. Its existence unblock every other skill in agent.

## When to use

- "write my sales playbook" / "draft the playbook" / "let's do the playbook".
- "update the playbook" / "our ideal customer changed, fix the playbook" / "update pricing stance".
- Called implicitly by any skill needing playbook if missing  -  only after confirming with user.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **CRM**  -  pull existing deal stages and closed-won accounts to seed the playbook. Optional.
- **Docs / notes**  -  read an existing playbook draft if you keep one in Notion or Google Docs. Optional.

I can run this skill from interview alone, so no connection is hard-required. If you mention a CRM and it isn't connected I'll ask you to link it.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Company name, website, and 30-second pitch**  -  Required. Why I need it: anchors the company-overview section and grounds every other section's framing. If missing I ask: "What's your company name, your homepage URL, and how would you pitch it in 30 seconds?"
- **Your ideal customer (industry, size, roles, pains, triggers)**  -  Required. Why I need it: drives ideal customer, buying-committee, and disqualifier sections. If missing I ask: "Who do you sell to today  -  industry, company size, the roles who actually use it, and what triggers them to buy?"
- **2-3 verbatim customer quotes**  -  Required. Why I need it: keeps pain language and objection handbook in your customers' words, not marketing-speak. If missing I ask: "Paste 2 or 3 things real customers have said about the pain, the category, or an objection they raised."
- **Your CRM and deal stages**  -  Required. Why I need it: seeds the deal-stages section with names you actually use. If missing I ask: "Which CRM do you use  -  HubSpot, Salesforce, Attio, Pipedrive, or Close  -  or paste your stage list."
- **Qualification framework**  -  Required. Why I need it: drives the qualification section (MEDDPICC, BANT, or your own). If missing I ask: "Do you run MEDDPICC, BANT, or your own qualification list?"
- **Pricing stance**  -  Optional. Why I need it: lets me write a real pricing section instead of TBD. If you don't have it I keep going with TBD.

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + existing playbook.** If `context/sales-context.md` exists, read so run is update, not rewrite. Preserve what founder already sharpened; change only stale or new.

2. **Mine recent calls if available.** Read `calls/*/analysis-*.md` and `call-insights/*.md`. Pull objection patterns and verbatim pain phrases straight into handbook; no paraphrase.

3. **Push for verbatim customer language.** Before draft, ask founder for 2-3 verbatim customer quotes (pain named, phrase about category, objection heard). If `call-insights/` has entries, mine those first. No marketer-speak paraphrase.

4. **Draft playbook (~500-800 words, opinionated, concrete).** Structure, in order:

   1. **Company overview**  -  one paragraph: what we make, who for, what make worth building now.
   2. **Ideal customer**  -  industry, size, region, stage. Name **1-2 anchor accounts** (real closed-won or target).
   3. **Buying committee**  -  champion (title + motivations), economic buyer (title + what win them), blocker (who kill deals + why), influencers.
   4. **Disqualifiers**  -  3-5 hard nos. See X, walk.
   5. **Qualification framework**  -  MEDDPICC / BANT / founder's own list. Write questions this agent ask to score each pillar.
   6. **Pricing stance**  -  model, bands (if disclosed), discount policy, minimum viable terms, non-negotiable line.
   7. **Deal stages + exit criteria**  -  what move deal Stage N → N+1. Concrete: "Stage 2 exits when champion has confirmed pain AND identified the economic buyer by name."
   8. **Objection handbook**  -  top 5 objections + founder's best current response. Prefer verbatim call-derived phrasing over marketing-speak.
   9. **Top 3 competitors**  -  named, one-line "they're strong at X, we beat on Y" each.
   10. **Primary first-call goal**  -  single ask every discovery call lands on. Concrete: "Next step is a technical validation with their eng lead in the next 7 days."

5. **Mark gaps honestly.** If section thin (no call data, no anchor account named), write `TBD  -  {what the founder should bring next}` not guess. Never invent.

6. **Write atomically.** Write to `context/sales-context.md.tmp`, then rename to `context/sales-context.md`. Single file. NOT under `.agents/`. NOT under `.houston/<agent>/`.

7. **Update ledger.** Set `universal.playbook = { present: true, path: "context/sales-context.md", lastUpdatedAt: <ISO> }` and any `universal.idealCustomer` / `domains.crm.dealStages` / `domains.meetings.qualificationFramework` fields interview newly captured. Atomic read-merge-write of `config/context-ledger.json`.

8. **Append to `outputs.json`.** Read existing array, append:

   ```json
   {
     "id": "<uuid v4>",
     "type": "playbook",
     "title": "Sales playbook updated",
     "summary": "<2-3 sentences  -  what changed this pass>",
     "path": "context/sales-context.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>",
     "domain": "playbook"
   }
   ```

   (Playbook itself live file, but each substantive edit indexed so founder see update on dashboard.)

9. **Summarize to user.** One paragraph: what you changed, what still `TBD`, exact next move (e.g. "run `profile-my-buyer` for {segment} to fill buying-committee section"). Remind them every other skill now has context.

## What I never do

- Invent ideal customer profile, pricing, competitors, or objections. Thin sections get `TBD`  -  never guessed.
- Overwrite sharpened sections on update pass  -  preserve what founder tightened.
- Write playbook anywhere except `context/sales-context.md`.

## Outputs

- `context/sales-context.md` (at agent root  -  live document).
- Updates `config/context-ledger.json`.
- Appends to `outputs.json` with `type: "playbook"`, `domain: "playbook"`.