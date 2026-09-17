---
name: pitch-me-on-podcasts
description: "Find podcasts where your ideal customer listens and draft a personalized pitch for each one. I shortlist shows by audience fit, check they're active, and write per-show emails with a hook that references a real episode. No template spam, you send from your own inbox."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [twitter]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Pitch Me on Podcasts

## When to use

- User: "pitch me onto podcasts" / "podcast outreach" / "find shows for our ideal customer" / "draft pitches for {N} shows".
- Monthly cadence natural  -  routinize OK.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Podcast directory (Listen Notes)**  -  discover shows by audience fit. Required.
- **Inbox (Gmail, Outlook)**  -  sample your voice for the pitch emails. Optional but the drafts feel flat without it.
- **X / Twitter**  -  optional, pull host context to make the hook specific.

If no podcast directory is connected I stop and ask you to connect Listen Notes from the Integrations tab.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning**  -  Required. Why I need it: the angle and audience fit flow from positioning. If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes."
- **Your voice**  -  Required for the pitch emails. If missing I ask: "Connect your sent inbox so I can sample your voice, or paste two or three emails you've sent."
- **The angle and target audience**  -  Required. Why I need it: shapes which shows I shortlist. If missing I ask: "What angle do you want to pitch on, and which audience, founders, operators, investors, technical buyers?"
- **Shows to exclude**  -  Optional. If missing I ask: "Any shows you've already pitched or want to skip? If you don't have a list I keep going with no exclusions."

## Steps
<!-- houston-workflow:v1 -->

1. **Read positioning doc**: `context/marketing-context.md`. Missing or empty → stop, tell user run `set-up-my-marketing-info` first.

2. **Read `config/voice.md` and `config/podcast-targets.json` (if exists).** `podcast-targets.json` missing → ask one targeted question:
   > "What angle do you want to pitch? E.g. 'solo-founder SaaS ops', 'AI for back-office accounting', 'bootstrapped-to-profitability'. And which audience  -  founders, operators, investors, technical buyers? I'll write this to `config/podcast-targets.json`."
   Capture `{ angle, audience, excludeShows?, capturedAt }`.

3. **Discover target podcasts.** Run `composio search podcast` (or `composio search listen-notes`) to find podcast-directory tool. Execute with angle + audience, pull 10-20 candidates. No directory tool connected → tell user which category to link, stop. Never fabricate shows.

4. **Rank and filter.** Per candidate, judge:
   - **Audience fit.** Matches ideal customer from positioning doc? Named audience segment?
   - **Show health.** Publishes monthly+, recent episodes last 90 days.
   - **Host angle.** Host interview operators / founders our space?
   - **Reachability.** Contact surface exist (email, form, Twitter)?
   Keep top 5-8. Drop dormant / off-topic / unreachable.

5. **Draft per-show pitches.** Per kept show:
   - **Hook** (subject line + opening sentence)  -  reference specific recent episode or angle so host see we listened.
   - **Angle**  -  specific episode idea we bring, tied to positioning statement. 2-3 sentences.
   - **Proof**  -  2-3 bullets: your role, specific outcome / metric, surprising take for air.
   - **Ask**  -  low-friction: "15 min to see if it's a fit?" / "Reply if the angle resonates and I'll send a one-pager."
   - Voice: match `config/voice.md`; err warm + specific.

6. **Write** all pitches into one file at `podcast-pitches/{YYYY-MM-DD}.md` atomically. Per-show sections. File structure:
   ```markdown
   # Podcast Pitch Batch  -  {YYYY-MM-DD}

   **Angle:** {from config}
   **Audience:** {from config}
   **Shows targeted:** {count}

   ---

   ## 1. {Show name}  -  host: {host}
   - Audience: {description}
   - Why this show: {one line}
   - Recent episode referenced: {title + URL}
   - Contact: {email / form URL / handle}

   **Subject:** {subject line}

   {full pitch email body}

   ---

   ## 2. {Show name} ...
   ```

7. **Append to `outputs.json`**  -  new entry, `type: "podcast-pitch"`, `path: "podcast-pitches/{YYYY-MM-DD}.md"`, `status: "draft"`.

8. **Summarize to user**  -  one paragraph: "{N} shows pitched: {list of show names}. Top match: {show}  -  host interviews {ideal customer} and ran a recent episode on {angle}. Review, pick which to send, then send from your inbox  -  I never send."

## Outputs

- `podcast-pitches/{YYYY-MM-DD}.md`
- Appends to `outputs.json` with `{ id, type: "podcast-pitch", title, summary, path, status: "draft", createdAt, updatedAt }`.
