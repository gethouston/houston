---
name: cold-email-sequence
description: "Co-write a 3-email cold outreach sequence one email at a time using the James Shields framework: trigger-based subject, three-sentence body, irresistible no-strings offer, one-word reply CTA. Each email locked with you before moving to the next. Phase 4 of both LinkedIn pipelines, also runnable standalone."
version: 1
category: Outbound
featured: no
image: memo
integrations: []
---

# Cold Email Sequence

Co-write a 3-email cold outreach sequence one email at a time. The sequence follows the James Shields framework: trigger-based subject, three-sentence body, irresistible no-strings offer, one-word reply CTA. I present each draft, refine with you, and lock it before moving to the next  -  voice, social proof, and offer all stay tight that way.

> **James Shields framework** - a widely-used outbound playbook that rejects the "book a demo" CTA in favor of trigger-based subjects, three-sentence bodies, free no-strings offers, and one-word reply CTAs. Optimized for reply rate, not impression count.

## When to use

- "Write me a cold email sequence for these contacts".
- "Draft 3-email outreach for {audience}".
- Phase 4 of either LinkedIn pipeline.
- You have a verified contact list (from Apollo, Clay, Hunter, or anywhere else) and want fresh copy.
- You want to refresh tired cold email copy with a proven framework.

## When NOT to use

- **Warm leads** who already know you  -  use a direct one-off email, not a 3-step cold sequence.
- **Lifecycle / onboarding / nurture** for existing users  -  that's a different motion (and lives in the Marketing agent).
- **Transactional** emails (receipts, password resets, notifications).
- **Post-call follow-ups**  -  use the Sales agent's `write-my-outreach` with `stage=followup`.
- **Newsletters or content emails**  -  use the Marketing agent's content skills.

## Connections I need

- **None.** This skill writes locally and produces a sequence file. Connections come back into play in `instantly-campaign` (the next phase).

## Information I need

I gather the inputs in step 1 below. The minimum:

- **Trigger / source** - what connects you to these leads (the LinkedIn post, the event, the news item).
- **Product** - one-line description of what you sell.
- **Social proof** - at least one case study with **real numbers** (no "10x improvement" without naming who and how). Preferably 3+ so each email gets fresh proof.
- **Offer** - the free / low-friction thing you're giving away (teardown, audit, free trial, free seat).
- **Reply CTA** - the one-word reply you want (defaults to "I'm in").
- **Sender** - your first name only.
- **Existing draft** - optional, any copy you want me to start from.

If any of trigger / product / social proof / offer is missing I ask for it inline before drafting.

## The framework

### Rule 1: Personalize the subject, not the body
- Subject references the trigger (post, event, comment).
- Body uses `{{firstName}}` only.
- Avoid `{{company}}` `{{title}}` etc. in the body  -  reply rates drop when the merge fields feel obvious.

### Rule 2: Three sentences plus PS (Email 1 only)
- S1: context / trigger (why you are emailing).
- S2: what you built / the offer.
- S3: social proof (specific numbers).
- PS: soft opt-out so they can disengage without ignoring.

### Rule 3: Irresistible offer
- Free access, no strings.
- "I just want honest feedback".
- No demo, no call, no commitment in the cold step.

### Rule 4: Low-friction CTA
- Reply with one word: "I'm in".
- NOT "book a call" or "schedule a demo".

### Rule 5: No fluff
- No em dashes (use periods).
- No "I hope this finds you well".
- No bullet points or formatting in the body.
- Lowercase subject lines.
- Write like you're texting a colleague.

## Steps

### Step 1: Gather inputs

Ask once, capture in the run notes. If anything's already in `config/context-ledger.json` (sender, voice, social proof bank), use it without re-asking. Confirm the trigger and the offer, since those change per campaign.

### Step 2: Email 1 - the opener (Day 0)

Draft to this template:

```
Subject: <personalized to trigger, lowercase, casual, 2-4 words>

Hey {{firstName}},

<1 sentence: I saw your <trigger>. Brief validation.>

<1-2 sentences: What I built. Concrete.>

<1-2 sentences: Social proof. Specific numbers.>

<1 sentence: The offer. Free, no strings.>

Reply "<cta>" and I'll <action>.

<sender first name>

PS <Soft opt-out, e.g. "If this is not your problem right now, just reply 'not now' and I'll go away.">
```

**Present to user. Refine until approved. Do NOT proceed until locked.**

### Step 3: Email 2 - the follow-up (Day 3)

Draft to this template:

```
Subject: (same thread, blank)

Hey {{firstName}},

<1 sentence: Follow up. Acknowledge inbox noise.>

<2 sentences: NEW social proof. Different client, different numbers from Email 1.>

<1 sentence: Restate offer.>

Reply "<cta>" and I'll <action>.

<sender first name>
```

Shorter than Email 1 (no PS). NEW social proof  -  never repeat from Email 1.

**Present to user. Refine until approved. Do NOT proceed until locked.**

### Step 4: Email 3 - the breakup (Day 7)

Draft to this template:

```
Subject: (same thread, blank)

Hey {{firstName}},

Last one from me on this.

<1 sentence: Tool is live. Others using it.>

<1 sentence: Final CTA - if you want yours, reply "<cta>" today.>

I won't email again after this.

<sender first name>
```

4 sentences max. "I won't email again" creates urgency. No new pitch.

**Present to user. Refine until approved.**

### Step 5: Save the locked sequence

Write to `sequences/{runId}-sequence.md` if called from an orchestrator (the orchestrator passes `runId`); otherwise `sequences/{YYYY-MM-DD}-{campaign-slug}-sequence.md`.

File format:

```markdown
# {Campaign name}

Locked on {ISO date}. Sender: {first name}. Target audience: {short description}.

## Email 1 (Day 0)

Subject: <subject>

<body>

## Email 2 (Day 3)

Subject: (same thread)

<body>

## Email 3 (Day 7)

Subject: (same thread)

<body>

## Sending notes

- Schedule: Mon-Fri, 8-5 in {timezone from context, default America/Vancouver}.
- Sending accounts: {from context, default "all connected"}.
- Lead count target: {from contacts file, e.g. "92 verified leads"}.
```

### Step 6: Append to outputs

`outputs.json` row: `{type: "sequence", title: "{Campaign name} sequence", summary: "3-email locked sequence ready for Instantly load.", path: "sequences/{file}", status: "locked", domain: "sequence"}`.

### Step 7: Final summary to user

One line: "Sequence locked at {path}. Ready to load into Instantly when you are."

## Outputs

- `sequences/{runId}-sequence.md`  -  locked 3-email sequence ready for `instantly-campaign`.
- `outputs.json`  -  one row, `type: "sequence"`, `status: "locked"`, `domain: "sequence"`.

## Quick reference

| Email | Day | Length | Subject | Goal |
|-------|-----|--------|---------|------|
| 1 Opener | 0 | 3 sentences + PS | Personalized to trigger, lowercase | Hook + offer + proof |
| 2 Follow-up | 3 | 3-4 sentences | Blank (same thread) | NEW social proof, restate offer |
| 3 Breakup | 7 | 4 sentences MAX | Blank (same thread) | Urgency, "won't email again" |

## Common mistakes

| Mistake | Why it kills the sequence | Fix |
|---|---|---|
| Long subject lines (6+ words, title case) | Looks like marketing, not a person | Lowercase, 2-4 words, references the trigger |
| Multiple CTAs in one email | Splits attention, lowers reply rate | One CTA per email, always the same reply word |
| Repeating social proof across emails | Wastes the second touch | Email 2 must use a NEW client and NEW numbers |
| "Just checking in" / "bumping this" | Reads as desperate filler | Acknowledge inbox noise once, then deliver new value |
| Booking links in Email 1 | Friction kills cold replies | Reply CTA only - links come after they say "I'm in" |
| Breaking the 3-sentence rule | Long emails get skimmed and trashed | Cut until each sentence is load-bearing |
| Em dashes, exclamation points, bullets | Looks AI-generated or markety | Plain text, periods only, write like a text message |

## What I never do

- **Write all 3 emails before showing you any.** Each email is locked with you before I draft the next. Catches voice drift early.
- **Reuse social proof across emails.** Email 2 must use a different client + different numbers from Email 1. If you only gave me one social proof point, I stop and ask for another before drafting Email 2.
- **Use em dashes, exclamation points, or AI-tell formatting in the body.** The instantly-campaign skill also strips ampersands at upload time (Instantly bug), but the body should not contain those characters from me in the first place.
- **Add tracking pixels or link shorteners to the body.** Cold deliverability is fragile; the sender platform handles tracking, the body stays plain.
- **Write a Subject for Email 2 or 3.** Keeping the thread (blank subject) is intentional and is what tells the recipient's inbox to thread them.
