---
name: mine-my-sales-calls
description: "Pull the exact words your customers use from your sales call recordings. I extract verbatim pain phrases, objection patterns, and positioning signals from Gong or Fireflies transcripts, ranked by frequency. This is the single best source for headlines, ad copy, and landing pages that sound like your buyer."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [gong, fireflies, fathom]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Mine My Sales Calls

Pull the exact words your customers use from your sales call recordings. I extract verbatim pain phrases, objection patterns, and positioning signals. Highest-leverage research input I have  -  verbatim customer language beats any marketer paraphrase.

## When to use

- "mine my sales calls" / "what are customers saying" / "extract objections from my calls".
- "pull positioning signals from last week's calls".
- Called implicitly by `set-up-my-marketing-info` (when pushing for verbatim quotes) and `profile-my-customer` (when building pains / objections sections).

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing -> I name the category, ask you to connect it from the Integrations tab, stop.

- **Meeting notes (Gong, Fireflies, Fathom, Circleback)**  -  pull recent call transcripts. Required (or you paste transcripts directly).

If no meeting-notes app is connected and you can't paste transcripts I stop and ask you to connect Gong, Fireflies, or Fathom from the Integrations tab.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning**  -  Required. Why I need it: I anchor the mining against your current claims so I can flag where customers contradict them. If missing I ask: "Want me to draft your positioning first? It's one action, takes about five minutes."
- **Which calls to mine**  -  Required. Why I need it: I won't pull your entire history blindly. If missing I ask: "Which batch should I pull, the last five calls, the last ten, a date range, or one specific account?"
- **Pasted transcripts**  -  Required only if no meeting-notes app is connected. If missing I ask: "Drop one to three call recordings or paste the transcripts you want me to read."

## Steps
<!-- houston-workflow:v1 -->

1. **Read positioning doc** (own file): `context/marketing-context.md`. Anchor mining  -  look for quotes that support, update, or contradict current claims.

2. **Pick source  -  ask ONE tight question if not obvious, with modality hint:**
   - "I can pull from your connected meeting-notes app, or you can paste 1-3 transcripts. Which?"
   - Connected: run `composio search meeting-notes`; list recent calls; ask user which batch (last 5, last 10, date range, specific account).
   - Pasted: take paste verbatim.

3. **If connected, fetch.** Execute discovered tool's list-recent-calls slug, then list-transcript slug per call. Capture: call date, attendees, duration, full transcript.

4. **Extract per call.** For each transcript:
   - **Verbatim pain language**  -  3-5 direct quotes where customer describes problem. Preserve word-for-word.
   - **Verbatim positioning language**  -  how they describe category, our product, competitors. Preserve.
   - **Objections raised**  -  actual objection, context, whether handled in call.
   - **Buying signals**  -  budget mentions, timeline mentions, stakeholder mentions.
   - **Surprises**  -  anything contradicting current positioning doc. Gold.

5. **Synthesize across batch.** Roll up:
   - Pain patterns  -  which pain language repeats, with frequency.
   - Objection patterns  -  top 3 objections by frequency.
   - Category language  -  words customers actually use (vs. what we use on site).
   - Deltas vs. positioning doc  -  what to add / change / remove in `context/marketing-context.md`.

6. **Structure artifact (markdown, ~400-700 words).** For batch, write `call-insights/{YYYY-MM-DD}-batch.md`. For single deep-dive on one call, write `call-insights/{call-slug}.md`. Structure:

   1. **Scope**  -  N calls, date range, accounts.
   2. **Top verbatim pains**  -  quoted, with speaker + call date.
   3. **Top verbatim positioning language**  -  how customers describe category + us + competitors.
   4. **Top 3 objections**  -  verbatim + context + handled/unhandled.
   5. **Buying signals spotted**  -  list.
   6. **Surprises + deltas vs. positioning doc**  -  bulleted recommendations for updates.
   7. **Hand-off list**  -  which agents get which insight. Example: `[lifecycle-email] Use phrase "{quote}" in the re-activation drip subject line.`

7. **Never invent.** Every quote ties to transcript + speaker + timestamp. If not said,  don't round up or summarize into quote. If transcripts too thin, say so and stop.

8. **Write atomically**  -  `{path}.tmp` then rename.

9. **Append to `outputs.json`.** Read-merge-write atomically:

   ```json
   {
     "id": "<uuid v4>",
     "type": "call-insight",
     "title": "<Call-insights batch YYYY-MM-DD>" | "<Call with {account}>",
     "summary": "<2-3 sentences  -  top pain pattern + top objection + delta vs. positioning>",
     "path": "call-insights/<slug>.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

10. **Offer positioning-doc update.** If deltas meaningful, ask user: "Want me to update the position doc with these customer phrasings?"  -  if yes, run `set-up-my-marketing-info` in update mode.

11. **Summarize to user.** One paragraph: top pain phrase, top objection, biggest positioning delta, path to artifact.

## Outputs

- `call-insights/{YYYY-MM-DD}-batch.md` or `call-insights/{call-slug}.md`.
- Appends to `outputs.json` with `type: "call-insight"`.
- May trigger `set-up-my-marketing-info` run (user approval required).
