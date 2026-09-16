---
name: set-up-my-marketing-info
description: "Tell me the basics about your company, your customer, and how you talk so I can give you better marketing help. I ask a few quick questions about your product, positioning, ideal customer, voice, and what you're selling right now. You only need to do this once, and I keep it updated as things change."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [googledocs, notion]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Set Up My Marketing Info

This skill create or update your positioning doc. Every other marketing skill read it first; if it doesn't exist, they stop and ask for it.

## When to use

- "help me write a positioning statement" / "draft my positioning" /
  "let's do positioning".
- "update the positioning doc" / "our ideal customer changed, fix the context
  doc".
- Called implicitly by any other skill needing positioning, finding
  doc missing  -  only after confirming with user.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing -> I name the category, ask you to connect it from the Integrations tab, stop.

- **Google Docs or Notion**  -  mirror the positioning doc somewhere you can share with advisors and a future hire. Optional, the local doc is the source of truth.
- **Meeting notes (Gong, Fireflies, Circleback)**  -  pull verbatim customer language so the doc isn't marketer-speak. Optional but the single highest-leverage input.
- **Inbox (Gmail, Outlook)**  -  sample your voice. Optional.

I can run this skill with no connections at all, I'll just lean harder on what you paste.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your company basics**  -  Required. Why I need it: the doc opens with what you make and who for. If missing I ask: "What's your company name, your website, and how would you describe what you do in one sentence?"
- **Your ideal customer**  -  Required. Why I need it: positioning without a target reader is just adjectives. If missing I ask: "Who's the customer you're trying to win, role, company size, what triggers them to look?"
- **Your voice**  -  Required. Why I need it: the doc carries voice rules every other skill reads. If missing I ask: "Connect your sent inbox so I can sample your voice, or paste two or three things you've written."
- **Two or three verbatim customer quotes**  -  Required. Why I need it: I won't paraphrase customers into marketer-speak. If missing I ask: "Drop a recent sales call recording, paste two or three customer phrases you remember word-for-word, or connect Gong / Fireflies so I can pull them."
- **One or two anchor accounts**  -  Optional. If missing I ask: "Name one or two real customers, or target customers, you'd point at as the perfect fit. If you don't have it I keep going with TBD."

## Steps
<!-- houston-workflow:v1 -->

1. **Read config.** Load `config/company.json`, `config/ideal-customer.json`,
   `config/voice.md`. If any missing, run `onboard-me` first (or
   ask ONE missing piece just-in-time with best-modality hint:
   connected app > file > URL > paste).

2. **Read existing doc if present.** If
   `context/marketing-context.md` exist, read so this run = update,
   not rewrite. Preserve anything founder already sharpened; change
   only stale or new.

3. **Push for verbatim customer language.** Before drafting, ask
   founder for 2-3 verbatim customer quotes (pain they named, phrase
   used about category, objection heard). If `call-insights/` has
   entries, mine those first. No marketer-speak paraphrases  -  push
   back if founder start "translating" customer words.

4. **Draft doc (~300-500 words, opinionated, direct).** Structure,
   in order:

   1. **Company overview**  -  one paragraph: what we make, who for,
      what make it worth building now.
   2. **Ideal customer**  -  industry, size, role, triggers. Name **1-2 anchor
      accounts** (real closed-won or target).
   3. **Jobs-to-be-done**  -  2-3 real jobs buyer hire product for.
      Verbatim customer language preferred.
   4. **Positioning statement**  -  one-sentence category + audience +
      differentiated value. Opinionated.
   5. **Category & differentiators**  -  category we play in + 3
      things actually set us apart (not "we're faster").
   6. **Top 3 competitors**  -  named, one-line "they're strong at X,
      we're strong at Y" each.
   7. **Brand voice notes**  -  4-6 bullets on tone, forbidden
      phrases, sentence-length preference. Pull from
      `config/voice.md`.
   8. **Pricing stance**  -  model + current range + one thing NOT
      negotiable.
   9. **Primary CTA**  -  one action every page / email / campaign
      push toward right now.

5. **Mark gaps honestly.** If section thin (no customer quotes yet,
   no anchor account), write `TBD  -  {what the founder should
   bring next}` instead of guessing. Never invent.

6. **Write atomically.** Write to
   `context/marketing-context.md.tmp`, then rename to
   `context/marketing-context.md`. Single file at agent root. NOT
   under subfolder. NOT under `.agents/`. NOT under
   `.houston/<agent>/`.

7. **Append to `outputs.json`.** Read existing array, append new
   entry, write atomically:

   ```json
   {
     "id": "<uuid v4>",
     "type": "positioning",
     "title": "Positioning doc updated",
     "summary": "<2-3 sentences  -  the positioning statement + what changed this pass>",
     "path": "context/marketing-context.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

   (Doc itself live file, but each substantive edit indexed so
   founder see update on dashboard.)

8. **Summarize to user.** One paragraph: what changed, what still
   `TBD`, exact next move (e.g. "paste 3 customer quotes and I'll
   tighten JTBD"). Remind them other four agents now have context
   they need.

## Outputs

- `context/marketing-context.md` (at agent root  -  live document)
- Appends to `outputs.json` with `type: "positioning"`.
