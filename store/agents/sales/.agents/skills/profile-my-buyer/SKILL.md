---
name: profile-my-buyer
description: "Build a sharp profile of who actually buys in a segment - champion, economic buyer, blocker, disqualifiers, anchor accounts. I pull from your CRM closed-won list or work from the examples you give me. Every cold email, call prep, and proposal I draft pulls from here."
version: 1
category: Sales
featured: no
image: handshake
integrations: [hubspot, salesforce, attio, pipedrive]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Profile My Buyer

Skill narrower than marketing persona. Goal: answer "who we sell to, who signs, who blocks, what triggers decision"  -  4 things agent + rep need to tune outreach + discovery.

## When to use

- "profile the buying committee for {segment}".
- "who signs at {segment}" / "who actually buys us".
- "build a sales persona for {segment}".
- Called by `set-up-my-sales-info` when buying-committee section thin.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **CRM**  -  pull top closed-won accounts in the segment (firmographics, contacts, time-to-close). Required unless you want to work from examples you give me.
- **Social**  -  enrich champion and economic-buyer profiles via LinkedIn. Optional.

If your CRM isn't connected I'll offer to work from 2 to 3 closed-won examples you describe directly.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: persona refines the buying-committee section there. If missing I ask: "I don't have your playbook yet  -  want me to draft it first?"
- **The segment to profile**  -  Required. Why I need it: persona is segment-specific, not generic. If missing I ask: "Which segment should I profile  -  industry, company size, geography?"
- **Source for accounts**  -  Required. Why I need it: I either pull from your CRM or work from examples you give me. If missing I ask: "Should I pull closed-won in this segment from your connected CRM, or do you want to walk me through 2 or 3 real accounts?"
- **Who signed and who blocked on past deals**  -  Optional. Why I need it: sharpens the economic-buyer and blocker patterns. If you don't have it I keep going with TBD on the blocker section.

## Workflow
<!-- houston-workflow:v1 -->

1. **Read playbook.** Load `context/sales-context.md`. If missing, run `set-up-my-sales-info` first.

2. **Source accounts.** Ask user: "Should I pull closed-won accounts in {segment} from your connected CRM, or work from examples you give me?" CRM route: `composio search crm` → pull top ~20 closed-won in segment. Example route: ask for 2–3 real accounts closed (or best-fit target accounts).

3. **Extract per-account.** For each account: firmographics (size, region, industry, stage), champion title + motivations, who signed contract, who pushed back or delayed, what triggered search, time-to-close, primary use case. Cite source (CRM record or founder description).

4. **Synthesize across accounts.** Write:
   - **Champion**  -  title patterns, pains named, motivations, what's in it for them when deal closes.
   - **Economic buyer**  -  title patterns (often different from champion), what wins them (return on investment, risk mitigation, status quo disruption, competitive parity), what they kill deals over.
   - **Blocker**  -  seat that most often kills deals in {segment} (often IT, legal, procurement, or counter-incumbent champion). How to neutralize.
   - **Influencers**  -  other seats needed on bus.
   - **Disqualifiers**  -  3 hard nos for {segment} specifically (if different from global playbook).
   - **Buying triggers**  -  concrete signals they starting search now (hiring pattern, funding, stack change, incident, regulatory deadline).

5. **Mark gaps honestly.** `TBD  -  need 2 more closed-won in segment` not guess.

6. **Write atomically.** Write to `personas/{segment-slug}.md.tmp`, then rename. Cite every claim.

7. **Append to `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "persona",
     "title": "Buying committee  -  {segment}",
     "summary": "<2–3 sentences  -  champion / EB / blocker pattern>",
     "path": "personas/{segment-slug}.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

8. **Summarize to user.** One paragraph + path. Flag which playbook sections persona updates (buying committee, disqualifiers, triggers) + whether recommend running `set-up-my-sales-info` next to fold in.

## Outputs

- `personas/{segment-slug}.md`
- Appends to `outputs.json` with `type: "persona"`.