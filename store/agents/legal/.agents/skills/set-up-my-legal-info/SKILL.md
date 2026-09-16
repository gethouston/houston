---
name: set-up-my-legal-info
description: "Tell me the basics about your company so I can give you better legal help. I ask a few quick questions about your entity, cap table, contracts in force, templates, and any open risks. You only need to do this once, and I keep it updated as things change."
version: 1
category: Setup
featured: yes
image: scroll
integrations: [googledocs, notion]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Set Up My Legal Info

This is the foundation document this agent reads before every substantive task. The skill creates or updates it through a short conversation with the user.

## When to use

- "set up my legal context" / "draft the legal context doc" / "build shared legal doc".
- "update legal context" / "our cap table changed, fix doc" / "just executed Acme MSA, add to standing agreements".
- Called implicitly by any other skill needing shared context when doc missing  -  only after confirming with user.

## Steps
<!-- houston-workflow:v1 -->

1. **Read config.** Load `config/entity.json`, `config/posture.json`, `config/templates.json`, `config/profile.json`. If any missing, ask ONE missing piece just-in-time using plain language (best-modality hint: connected app > file drop > URL > paste).

2. **Read existing doc if present.** If `legal-context.md` exists, read so run is update, not rewrite. Preserve founder-sharpened parts; change only stale or new.

3. **Pull cap table + standing agreements if sources connected.** If cap-table tool connected (`composio search cap-table`  -  Carta / Pulley / other), pull current snapshot (founder stake, option pool, priced round terms), capture source + last update date. Do not invent numbers. If nothing connected, ask founder for one-line snapshot, mark source `"self-reported"`.

4. **Ask minimum just-in-time questions.** Interview covers only what config didn't answer:
   - Cap table snapshot (if no Carta/Pulley linked)  -  founder stake, option pool, priced-round terms.
   - Standing agreements in force  -  customer / vendor / contractor / investor summaries (1 line each, not full text).
   - Open risks  -  un-filed 83(b)? unsigned CIIAA? expired DPA? undocumented contractor IP? Anything founder knows unresolved.
   - Escalation rules  -  anything founder wants always escalated (e.g. "always flag > $50K ACV deals").

5. **Draft doc (~400-600 words, direct, verb-led).** Structure, in order:

   1. **Entity**  -  name, state, entity type, formation date, authorized shares, par value, registered agent, incorporated via. Mark `TBD` for anything missing.
   2. **Cap table snapshot**  -  last update date, source (Carta / Pulley / spreadsheet / self-reported), founder stake, option pool, priced-round terms (if any).
   3. **Standing agreements**  -  bulleted list by category (customers, vendors, contractors, investors). One line per agreement: counterparty, type, effective date, term / auto-renewal, key obligations. Summary only, not full text.
   4. **Template stack**  -  pointers to current NDA / MSA / consulting / offer / DPA templates. Each with version + last-reviewed date. Mark `none` if founder has no template for that kind.
   5. **Open risks**  -  bulleted. Each with severity (low / med / high) + one-line description. Escalate severity `high` in dashboard.
   6. **Founder risk posture**  -  stance (aggressive / middle / conservative) + clause-level color from `config/posture.json`. Keep verbatim founder notes where given.
   7. **Escalation rules**  -  what I will and won't handle without human lawyer. Default floor: anything over $100K ACV, any non-standard indemnity, any IP going out, any cell at `major × likely` on 5×5 severity×likelihood read.

6. **Mark gaps honestly.** If section thin (no cap table connected, no standing agreements yet, open risks uninterviewed), write `TBD  -  {what founder should bring next}` rather than guessing. Never invent dates, shares, counterparties.

7. **Write atomically.** Write to `legal-context.md.tmp`, rename to `legal-context.md`. Single file at agent root. NOT under subfolder. NOT under `.agents/`. NOT under `.houston/<agent>/`.

8. **Append to `outputs.json`.** Read existing array, append new entry, write atomically:

   ```json
   {
     "id": "<uuid v4>",
     "type": "legal-context",
     "title": "Legal context updated",
     "summary": "<2-3 sentences  -  what changed this pass, e.g. added Acme MSA to standing agreements; flipped posture to conservative on liability>",
     "path": "legal-context.md",
     "status": "ready",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

   (Doc itself is live file, but each substantive edit indexed so founder sees update on dashboard. Ship as `ready`  -  doc is factual snapshot, not draft.)

9. **Summarize to user.** One short paragraph in plain language: what you now know, what's still missing, and the single most useful thing to do next (e.g. "Connect Carta and I can keep your cap table fresh automatically.") Never name file paths or internal field names.

## Outputs

- `legal-context.md` (at agent root  -  live document)
- Appends to `outputs.json` with `type: "legal-context"`, `status: "ready"`.