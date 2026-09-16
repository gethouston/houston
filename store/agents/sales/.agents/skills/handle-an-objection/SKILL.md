---
name: handle-an-objection
description: "Draft a sharp three-sentence reframe to use on the call (acknowledge → concrete anchor-account example → dated next step) plus a short follow-up email in your voice. I look up the objection in your playbook and recent call insights so the response is grounded, not improvised."
version: 1
category: Sales
featured: no
image: handshake
x_houston:
  created_by: houston
  skill_schema: 1
---


# Handle An Objection

Single-objection handler. Two outputs: in-call reframe (short, verbal) + post-call follow-up email (short, written).

## When to use

- "they said '{objection}' on the {deal} call  -  draft my reframe".
- "how do I handle '{objection}'".
- Called by `check-my-sales subject=discovery-call` for any OBJECTION surfaced in call.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox**  -  sample your sent emails to match voice on the post-call follow-up. Optional but recommended.

I can run this skill from your playbook and call notes alone, so no connection is hard-required.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: the objection handbook and anchor accounts ground the reframe. If missing I ask: "I don't have your playbook yet  -  want me to draft it now?"
- **The objection in their words**  -  Required. Why I need it: I reframe the actual phrase, not a paraphrase. If missing I ask: "What did they say, word for word?"
- **Which deal this came up on**  -  Required. Why I need it: I save the reframe under that deal and pull context from the call. If missing I ask: "Which prospect or deal raised this?"
- **Voice samples**  -  Optional. Why I need it: makes the post-call email sound like you. If you don't have it I keep going with TBD and use a neutral tone.

## Workflow
<!-- houston-workflow:v1 -->

1. **Read the playbook.** Load `context/sales-context.md`. Find matching entry in Objection handbook. If playbook missing, ask user to run `set-up-my-sales-info` first, stop.

2. **Read the ledger.** Load `config/context-ledger.json`. `universal.idealCustomer` field grounds reframe; progressive captures there may supersede playbook's initial objection list.

3. **Check recent call-insights**  -  read `call-insights/*.md` (top 3 most recent) for pattern touching this objection. Prefer verbatim successful reframes from past calls.

4. **Draft the in-call reframe (3 sentences):**

   1. **Acknowledge**  -  no backpedal, no dismiss.
   2. **Reframe** with concrete customer example or data point (use anchor accounts from `context/sales-context.md`).
   3. **Propose next step**  -  specific, time-boxed.

5. **Draft the post-call follow-up email**  -  5–8 lines:

   - Subject: "Re: {their pain, in their words}"
   - Open: confirm heard them.
   - 2–3 bullets: facts/proof addressing specific objection.
   - Close: concrete next step + date.

   Match voice from `config/voice.md` (or capture samples on first run if missing).

6. **Write atomically** to `deals/{slug}/objections/{YYYY-MM-DD}-{slug}.md.tmp` → rename. Structure: objection (verbatim) · reframe (3 lines) · follow-up email (body) · sources (playbook + calls referenced).

7. **Update the ledger**  -  if objection surfaced new variant, append to `universal.idealCustomer.pains` via atomic read-merge-write of `config/context-ledger.json`.

8. **Append to `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "objection",
     "title": "Objection  -  {objection short}",
     "summary": "<reframe first line + follow-up CTA>",
     "path": "deals/{slug}/objections/{date}-{slug}.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

9. **Summarize.** Print 3-sentence reframe inline so user can use verbally on next touch. Path to full artifact.

## Outputs

- `deals/{slug}/objections/{YYYY-MM-DD}-{slug}.md`
- Possibly updates `config/context-ledger.json`.
- Appends to `outputs.json` with `domain: "meetings"`, type `objection-reframe`.