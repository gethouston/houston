---
name: draft-a-message
description: "Get a message drafted in your voice and saved to your inbox so you only have to hit send. Pick what you need: a reply to an inbound thread; a follow-up that either logs a commitment to your ledger or drafts the fulfillment when one comes due; or vendor outreach for renewals, cancellations, trials, or reference checks grounded in your real contract terms."
version: 1
category: Operations
featured: no
image: clipboard
integrations: [gmail, outlook]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Draft A Message

One drafting primitive for every outbound. Your voice, your approval, your send button  -  never send, never commit, never sign.

## When to use

- `type=reply`  -  "draft responses" / "reply to {name}" / "draft replies to inbound emails in my triage".
- `type=followup`  -  "track this follow-up" (TRACK sub-mode) / "remind me to follow up with {X}" (TRACK) / "handle my due follow-ups" (HANDLE).
- `type=vendor`  -  "draft renewal-negotiation email" / "write cancel email for {SaaS}" / "reach out to {supplier} for trial" / "reference-check email for {vendor}".

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox** (Gmail, Outlook)  -  Required. Pulls the thread I'm replying to, samples your voice, and saves the draft back to your inbox so you can review and send.
- **Files** (Google Drive)  -  Optional. Lets me read vendor contracts when drafting renewal or cancel emails.

If no inbox is connected I stop and ask you to connect your inbox first.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your voice**  -  Required. Why I need it: replies sound like you instead of a template. If missing I ask: "Best way is to connect your inbox so I can sample 20 to 30 sent messages. Otherwise paste 3 to 5 recent replies you've written and I'll work from those."
- **Operating context doc**  -  Required. Why I need it: anchors priorities and key contacts so replies stay on-message. If missing I ask: "Want me to set up your operating context first? Replies sharpen a lot once I have it."
- **VIPs**  -  Optional. Why I need it: shapes tone and deference. If you don't have it I keep going with TBD and treat everyone equally.
- **Vendor posture**  -  Required for `type=vendor`. Why I need it: drives renewal asks and walk-away language. If missing I ask: "How do you approach vendor talks  -  push hard for terms, or keep it light? Who's allowed to sign?"

## Parameter: `type`

- `reply`  -  answer inbound thread. Pull thread from connected inbox, draft reply in your voice, save as draft in inbox provider, log human-readable record. Output: `drafts/reply-{YYYY-MM-DD}-{thread-slug}.md`.
- `followup`  -  two sub-modes:
  - TRACK (default when you say "track this" / "remind me")  -  extract commitment (who, what, by when), append to `followups.json`, no draft yet.
  - HANDLE (when you say "handle due follow-ups" / "draft the overdue ones")  -  read `followups.json`, for each follow-up with due date ≤ today, draft either fulfillment or honest bump ("Following up on the {X} I promised by {Y}  -  status: {Z}"). Output: `drafts/followup-{YYYY-MM-DD}-{slug}.md`.
- `vendor`  -  renewal / cancel / trial / reference-check outreach. Grounded in contract terms from `contracts/` + vendor posture from `context/operations-context.md`. Output: `drafts/vendor-{type}-{vendor-slug}.md`.

## Steps
<!-- houston-workflow:v1 -->

1. Read ledger; fill `universal.voice` + any `domains.vendors.posture` gap with ONE modality-ranked question.
2. Read `context/operations-context.md`  -  priorities, key contacts, hard nos, voice notes.
3. Branch on `type`:

   **If `type = reply`:**
   - Pull target thread(s) from connected inbox (Gmail / Outlook via Composio). If you named someone, resolve most-recent unanswered thread.
   - Read thread history + `context/operations-context.md` + `config/voice.md`.
   - Draft reply: direct, opinionated when warranted, voice-matched. No hedging ("I think maybe"), no filler greetings.
   - Save as DRAFT in inbox via Composio  -  use inbox provider's own draft facility, never send. Also write human-readable record to `drafts/reply-{YYYY-MM-DD}-{slug}.md` for offline review.

   **If `type = followup` + TRACK sub-mode:**
   - Parse commitment from user input or referenced outbound (who owes what to whom, by when).
   - Append to `followups.json` with `{id, createdAt, updatedAt, with, commitment, dueAt, status: "pending", sourceArtifact}`.
   - No draft yet  -  tracking is deliverable.

   **If `type = followup` + HANDLE sub-mode:**
   - Read `followups.json`. For every follow-up with `status == "pending"` and `dueAt <= today`:
     - If commitment fulfilled elsewhere (outbound exists in `drafts/` addressing it), flip to `status: "ready-to-close"`.
     - Else, draft fulfillment or honest bump. Use voice. Save to `drafts/followup-{YYYY-MM-DD}-{slug}.md` AND as inbox draft via Composio.

   **If `type = vendor`:**
   - Read vendor's contract if present (`contracts/{vendor-slug}/`). Extract: term, renewal window, price, unfavorable clauses.
   - Read vendor posture from `context/operations-context.md` (risk appetite, signature authority, paper preference).
   - Draft requested outbound sub-type:
     - Renewal-negotiation: lead with data (usage / value), specific ask (price, term, terms), walk-away.
     - Cancel: direct, grateful, specific (cite clause + effective date).
     - Trial: positioning fit + specific use case + success criteria + honest timeline.
     - Reference-check: 3-5 targeted questions based on what we're evaluating against.
   - Save as inbox draft via Composio + write record to `drafts/vendor-{sub-type}-{vendor-slug}.md`.

4. Every branch: write atomically (`.tmp` → rename).
5. Append to `outputs.json` with `{id, type, title, summary, path, status: "draft", createdAt, updatedAt, domain: "people" or "vendors"}`. Type = `"reply-draft"` / `"followup-log"` / `"followup-draft"` / `"vendor-draft"`.
6. Summarize to you: path to draft + what to double-check before approving.

## Outputs

- `drafts/reply-{YYYY-MM-DD}-{slug}.md`
- `followups.json` (upsert) and/or `drafts/followup-{YYYY-MM-DD}-{slug}.md`
- `drafts/vendor-{sub-type}-{vendor-slug}.md`
- Appends to `outputs.json`; inbox drafts via Composio for reply / followup-handle / vendor types.

## What I never do

- Send, schedule-send, or auto-archive. Every outbound is draft you approve + send from your own inbox.
- Commit on your behalf (no "I'll get it to you by Friday" unless you said so in thread).
- Invent vendor usage stats or contract terms  -  if contract isn't in `contracts/` or pasted, mark TBD and ask.
- Negotiate price without explicit ask from you (e.g. "ask for 20% off annual").