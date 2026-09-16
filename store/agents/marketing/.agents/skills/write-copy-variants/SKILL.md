---
name: write-copy-variants
description: "Get copy variants for the piece that needs the most help right now. Pick the job: headline variants for a page, CTA button options, ad copy for a campaign, or a tightening pass on existing copy. Every variant is grounded in a real customer quote or positioning claim, ranked so you know what to test first. Drafts only."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [reddit, firecrawl, linkedin]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Write Copy Variants

One skill for every copy-variant need. `job` param picks the shape, source rules, and output format. Shared rule across all jobs: every variant grounded in real customer quote or positioning-doc claim  -  no marketer-speak, no invention.

## Parameter: `job`

- `headlines`  -  10 headline + subhead pairs for a named page, each citing a verbatim customer quote, ranked top 3 to test first. Output: `headline-variants/{page-slug}-{YYYY-MM-DD}.md`.
- `ctas`  -  5-7 CTA button-copy variants, each paired with the objection it answers and the outcome it implies. Output: `cta-variants/{page-slug}-{YYYY-MM-DD}.md`.
- `ad-copy`  -  10 headlines + 5 descriptions + 3 creative concepts for a named campaign and platform, respecting platform char limits, each grounded in a source quote. Output: `ad-copy/{campaign-slug}.md`.
- `edit`  -  five-sweep tightening pass on existing copy (clarity, voice, specificity, length, CTAs) with before/after/why per line changed. Output: `copy-edits/{page-slug}-{YYYY-MM-DD}.md`.

User names job in plain English ("10 headlines for my homepage", "better CTA for signup", "ad copy for Q2 launch", "tighten my about page") -> infer. Ambiguous -> ask ONE question naming all four jobs.

## When to use

**headlines:**
- "10 headline variants for my homepage"
- "Alternative hero hooks for the {campaign} landing page"
- "Headline options for the pricing page"
- Often follows `write-my-page-copy` or `audit-a-surface` (surface=landing-page) when the headline gets flagged as the fix.

**ctas:**
- "Better CTA for my signup button"
- "CTA variants for the pricing page"
- "What should the demo button say?"
- Often follows `write-copy-variants` (job=headlines) or `write-copy-variants` (job=edit) when CTA flagged weak.

**ad-copy:**
- "Draft 10 ad copy variants for {product}"
- "Write Google search headlines for {keyword}"
- "Give me Meta creative for the {campaign} launch"
- "Ad copy that sounds like my customers actually talk" / "10 headlines, each with the quote behind it" / "mine the G2 reviews and write Meta variants from them"  -  same skill, the verbatim-quote rule is already non-negotiable.
- Follows `plan-a-campaign` (hand-off: "For copy, run `write-copy-variants` job=ad-copy on this campaign's angles") or `mine-my-sales-calls` (turn extracted phrases into ad variants).

**edit:**
- "Edit the copy on my {page}"
- "Tighten this  -  too wordy"
- "Polish my about page"
- "Proofread and sharpen this"
- Called after `write-my-page-copy` to polish final draft in one focused pass.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing -> I name the category, ask you to connect it from the Integrations tab, stop.

- **Web scrape (Firecrawl)**  -  optional for `headlines` and `ad-copy` (fetches the page and category reviews cleanly; falls back to basic HTTP fetch). Required for `edit` when user gives a URL instead of pasting copy.
- **Reddit**  -  optional for `headlines` and `ad-copy`, lets me scrape category subreddits for verbatim phrases when no call insights exist.
- **Social platforms (LinkedIn)**  -  optional for `ad-copy`, format constraints differ per platform and I fit copy to whichever you target.
- **Inbox (Gmail, Outlook)**  -  optional for `ctas` and `edit`, sample your voice. The edits feel flat without it.

For `headlines` and `ad-copy`: if you have no call insights, the page is JS-heavy enough that basic fetch returns nothing readable, and you can't paste a few customer quotes, I stop.

For `ctas`: I can run with no connections  -  your positioning doc and call insights are the load-bearing inputs.

For `edit`: I can run with no connections if you paste the copy directly.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning**  -  Required (all jobs). Why I need it: every variant has to be grounded in your category and ideal customer, not generic patterns. If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes."
- **Your voice**  -  Required (all jobs). Why I need it: variants in the wrong voice are unusable; for `edit`, without voice rules the pass turns into chatbot-speak. If missing I ask: "Connect your sent inbox so I can sample your voice, or paste two or three things you've written."
- **The page and primary conversion**  -  Required for `headlines` and `ctas`. Why I need it: a hero headline and a meta-title carry different constraints; a signup CTA and a pricing CTA carry different jobs. If missing I ask: "Which page is this for, and what's the one action a visitor should take?"
- **Customer quotes**  -  Required for `headlines` and `ad-copy`. Why I need it: I won't write a headline without a real phrase behind it. If missing I ask: "Connect Gong or Fireflies so I can mine your sales calls, paste five verbatim customer phrases, or point me at G2 / Capterra reviews."
- **Top objections**  -  Optional for `ctas`. If missing I ask: "What makes visitors hesitate at this button? If you don't have it I lift the top objections from your positioning."
- **The ad platform**  -  Required for `ad-copy`. Why I need it: Google, Meta, and LinkedIn all carry different character limits. If missing I ask: "Which platform are these ads running on, Google, Meta, LinkedIn, or somewhere else?"
- **The campaign or angle**  -  Required for `ad-copy`. Why I need it: ten variants without a target angle is a kitchen sink. If missing I ask: "What's the campaign or angle these ads are for?"
- **The copy to edit**  -  Required for `edit`. If missing I ask: "Paste the copy you want edited, or give me the URL of the page."

## Steps
<!-- houston-workflow:v1 -->

### Shared steps (all jobs)

1. **Read positioning doc** at `context/marketing-context.md`. If missing, tell user run `set-up-my-marketing-info` first and stop.
2. **Read `config/voice.md`.** If missing, ask ONE question naming best modality (connected inbox via Composio > paste 2-3 samples). Write before continuing.
3. **Source customer language  -  priority order** (for `headlines`, `ctas`, `ad-copy`):
   - a) `call-insights/`  -  folder exists -> read most recent 3-5 files. Extract verbatim pain / desire / trigger phrases.
   - b) `research/`  -  quote banks from research briefs.
   - c) Neither exists -> run `composio search` for review-scrape tools (G2, Capterra, Trustpilot, Reddit, App Store). Pull competitor / category reviews. Quote verbatim.
   - d) No review-scrape tool connected -> ask user link one category, paste 5-10 customer quotes, or point at review URLs. Stop.

### Branch on `job`:

#### `headlines`

4. **Identify page + primary conversion.** Read `config/primary-page.json`. User named different page -> ask URL / conversion if not obvious. Continue.
5. **Build quote bank.** 10-20 verbatim phrases, each tagged `pain` / `desire` / `objection` / `trigger` / `positioning-doc`. Cite source (call ID / review platform + URL / positioning line).
6. **Generate variants.** 10 headline + subhead pairs. For each:
   - Headline (founder voice, grounded in specific quote from bank  -  name quote tag).
   - Subhead  -  1-2 lines expanding headline with specificity.
   - Angle label  -  one of: outcome-over-feature, problem-framed, "without X", contrarian, urgency, social-proof-led, category-definition, transformation, question-hook, numeric.
   Respect page length constraints (hero ~<12 words, meta titles ~60 chars)  -  ask if unclear.
7. **Rank top 3 to test first.** Rank by: (a) strength of source quote (frequency / pain intensity), (b) alignment with positioning doc primary claim, (c) contrast with current page copy. Name headline kept as control + 3 challengers.
8. **Hand-off hooks.** Top variant needs formal A/B test -> name `measure-my-marketing` (scope=ab-test). Needs CTA work -> name `write-copy-variants` (job=ctas) as next step.
9. **Write** atomically to `headline-variants/{page-slug}-{YYYY-MM-DD}.md` (`*.tmp` -> rename). Quote bank first, then variants with source quote next to each.
10. **Append to `outputs.json`**  -  `{ id, type: "headline-variants", title, summary, path, status: "draft", createdAt, updatedAt }`.
11. **Summarize to user**  -  top 3 variants to test, pain each addresses, path to full file.

#### `ctas`

4. **Read `config/primary-page.json`** for primary conversion event. If user named different button / conversion, accept + continue.
5. **Identify surface.** Ask (if unclear) ONE question: which button, which page, which step in flow. Short paste okay.
6. **List objections.** Pull top 3-5 objections from positioning doc (or `call-insights/` if present). If objections undocumented, ask user top 2 ("What makes visitors hesitate on this button?") + note in output as "founder-flagged".
7. **Draft 5-7 CTA variants.** Each:
   - Exact button text (short  -  2-5 words).
   - Objection it answers (named from list above).
   - Implied outcome (what user get on click).
   - Angle: action-led, outcome-led, risk-reversal, social-proof, micro-commitment, specificity-led, urgency.
   Never: "Submit", "Click Here", "Learn More", "Get Started" without object.
8. **Rank top 2 to test first.** Based on which objection most common in evidence + which outcome positioning doc most support.
9. **Flag supporting copy.** Note if CTA need trust line below ("No credit card required" / "Cancel anytime") + whether copy tie to real policy (don't invent).
10. **Hand-off hooks.** If top variants need A/B test, name `measure-my-marketing` (scope=ab-test).
11. **Write** atomically to `cta-variants/{page-slug}-{YYYY-MM-DD}.md` (`*.tmp` -> rename).
12. **Append to `outputs.json`**  -  `{ id, type: "cta-variants", title, summary, path, status: "draft", createdAt, updatedAt }`.
13. **Summarize to user**  -  top 2 CTAs, objection each answer, path to full file.

#### `ad-copy`

4. **Read config:** `config/channels.json` (format constraints vary by channel  -  Google RSA vs. Meta vs. LinkedIn). No channel named, ask which platform in one question.
5. **Build quote bank.** 10-20 verbatim phrases, each tagged `pain` / `desire` / `objection` / `trigger`. Cite source (call ID / review platform / URL).
6. **Generate variants.** For named campaign / angle, produce:
   - **Headlines**  -  10 variants, each grounded in specific quote (cite quote tag next to each). Respect platform char limits (Google RSA 30; Meta primary ~40; LinkedIn ~70).
   - **Descriptions**  -  5 variants, same grounding rule.
   - **CTAs**  -  5 variants.
   - **Creative concepts** (for visual placements)  -  3 short briefs (image direction + overlay text), each tied to angle.
7. **Rank** variants by hypothesis strength: which quote strongest pain, which angle positioning doc most supports. Name top 3 to test first.
8. **Write** atomically to `ad-copy/{campaign-slug}.md` (`*.tmp` -> rename). Format: quote bank first, then variants with source quote next to each.
9. **Append to `outputs.json`**  -  `{ id, type: "ad-copy", title, summary, path, status: "draft", createdAt, updatedAt }`. Merge, atomic write.
10. **Summarize to user**  -  top 3 variants to test, pain they address, path to full file.

#### `edit`

4. **Collect source copy.** User pasted -> work from paste. User gave URL -> fetch via any Composio-connected scraper (discover slug with `composio search`, execute by slug). Nothing provided -> ask for copy or URL and stop.
5. **Run sweeps** in order. Each sweep focused  -  no multiplex. After each, loop back, check prior sweeps not compromised.
   - **Clarity**  -  confusing sentences, unclear pronouns, jargon, ambiguity, missing context, sentences doing too much.
   - **Voice**  -  consistency with `config/voice.md`. Flag lines where voice breaks (started casual, went corporate; shifted person; etc.).
   - **Specificity**  -  swap vague claims with concrete. "Saves time" -> "Cuts weekly reporting from 4 hours to 15 minutes." Numbers over adjectives. No numbers from user -> mark `[NEEDS NUMBER]` inline; no invent.
   - **Length**  -  kill filler. "In order to" -> "to". "At this point in time" -> "now". Drop exclamation points.
   - **CTAs**  -  swap weak CTAs ("Submit" / "Click Here" / "Learn More") with action + outcome ("Start my free trial" / "See pricing for my team"). Change load-bearing -> hand to `write-copy-variants` (job=ctas).
6. **Output format.** Each line changed -> three rows:
   - **Current** (verbatim).
   - **Proposed**.
   - **Why**  -  one line. Name sweep that caught it (clarity / voice / specificity / length / CTA).
7. **Preserve core message.** Rewrite of idea needed -> flag it, no overwrite. Hand that section to `write-my-page-copy` instead.
8. **Flag contradictions** with positioning doc in separate section.
9. **Write** atomic to `copy-edits/{page-slug}-{YYYY-MM-DD}.md` (`*.tmp` -> rename).
10. **Append to `outputs.json`**  -  `{ id, type: "copy-edit", title, summary, path, status: "draft", createdAt, updatedAt }`.
11. **Summarize to user**  -  count of lines changed, single highest-leverage edit, path to pass.

## What I never do

- Invent customer quotes, stats, or testimonials to "strengthen" a line. Can't point a headline at a specific quote or positioning-doc line -> don't write it.
- Write marketer-speak ("Revolutionary AI-powered platform") in any variant  -  goes in the bin.
- Invent trust lines ("No credit card required" only if true).
- Use generic CTAs without object ("Submit", "Click Here", "Learn More", "Get Started" without object).
- Promise outcomes product doesn't deliver.
- Rewrite core message in `edit` job  -  that's `write-my-page-copy`'s job.
- Smooth user voice into generic marketing-speak.
- Send, post, publish, or push live  -  you ship every artifact.

## Outputs

- `headline-variants/{page-slug}-{YYYY-MM-DD}.md` (job=headlines)
- `cta-variants/{page-slug}-{YYYY-MM-DD}.md` (job=ctas)
- `ad-copy/{campaign-slug}.md` (job=ad-copy)
- `copy-edits/{page-slug}-{YYYY-MM-DD}.md` (job=edit)
- All append to `outputs.json` with matching `type`: `"headline-variants"` | `"cta-variants"` | `"ad-copy"` | `"copy-edit"`.
