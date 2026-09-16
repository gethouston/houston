---
name: write-a-post
description: "Draft a piece of content in your voice, grounded in your positioning. Pick the channel: a long-form blog post, a LinkedIn post, an X thread, a newsletter, or a Reddit reply. Channel-native copy that sounds like you, not a content mill. Drafts only, you always post."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [googledocs, linkedin, twitter, reddit, mailchimp, firecrawl]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Write a Post

Channel-native drafting, one skill. `channel` param pick shape. Core discipline  -  positioning, voice, no invented stats, drafts only  -  shared across channels.

## Parameter: `channel`

- `blog`  -  2,000-3,000 word SEO-aware post → `blog-posts/{slug}.md`.
- `linkedin`  -  hook-first native post → `posts/linkedin-{slug}.md`.
- `x-thread`  -  5-12 tweet thread → `threads/x-{slug}.md`.
- `newsletter`  -  subject + preview + body, one through-line →
  `newsletters/{YYYY-MM-DD}.md`.
- `reddit`  -  value-first community reply (source thread via
  Composio/Firecrawl) → `community-replies/{source-slug}.md`.

User name channel plain English ("X thread", "Reddit reply", "this week's newsletter") → infer. Ambiguous → ask ONE question naming 5 options.

## When to use

- Explicit: "draft a {blog post / LinkedIn post / X thread /
  newsletter / Reddit reply} on {topic}", "write me a post about {X}",
  "respond to this thread at {URL}".
- Implicit: called by `plan-a-campaign` (launch / announcement) for
  channel pieces, or by `watch-my-competitors`
  (social-feed) on flagged high-signal thread.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Web search (Exa, Perplexity)**  -  SERP scan for `blog`, light grounding for posts. Required for `blog`  -  no useful fallback, I need a search engine to compare existing coverage.
- **Web scrape (Firecrawl)**  -  optional. If not connected I fall back to basic HTTP fetch on competitor / source URLs, rougher but workable on static pages.
- **Google Docs**  -  mirror the blog draft into a Doc you can hand to anyone for review. Optional for `blog`.
- **Reddit**  -  read the source thread for `reddit`. Required for `reddit`  -  no fallback, the API gates access.
- **Social platforms (LinkedIn, X)**  -  optional for `linkedin` and `x-thread`.
- **Email platform (Customer.io, Loops, Mailchimp, Kit)**  -  drop the newsletter into a draft. Optional for `newsletter`.

For `blog` I stop if web search isn't connected. For `reddit` I stop if Reddit isn't connected. Web scrape fallback keeps me going on its own.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your company name and pitch**  -  Required for every channel. Why I need it: anchors the post in what you actually do. If missing I ask: "What's the company name, and how do you describe what it does in one sentence?"
- **Your voice**  -  Required for every channel. Why I need it: a generic-sounding post gets ignored. If missing I ask: "Connect your LinkedIn or your sent inbox so I can sample your voice, or paste two or three things you've written."
- **Your positioning**  -  Required for every channel. If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes."
- **Your social platforms and topics**  -  Required for `linkedin`, `x-thread`, `reddit`. If missing I ask: "Which platforms do you post on, and what topics do you want me to write about?"
- **Your email platform**  -  Required for `newsletter` (so I can name the tool you'll paste into). If missing I ask: "Which email tool do you use to send your newsletter?"

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + positioning.** Load `config/context-ledger.json`
   and `context/marketing-context.md`. Gather missing required fields
   per list above (ONE question each, best-modality first).
2. **Resolve channel + topic.** Confirm param. Topic not explicit →
   ask ONE question: "What's the angle / hook /
   target keyword?"
3. **Research pass (channel-scaled).**
   - `blog`  -  run `composio search seo` / `composio search web` for
     top 5-10 SERP results on target keyword; extract angle
     gaps + expected structure.
   - `linkedin` | `x-thread`  -  optional, `composio search web` for
     1-3 grounding facts. Skip pure story/opinion.
   - `newsletter`  -  pull source material (paste, user links, recent
     `blog-posts/` entries indexed in `outputs.json`). Nothing →
     ask: "What happened this week worth an email?"
   - `reddit`  -  run `composio search web-scrape` (or
     `composio search reddit`), fetch thread URL, pull OP + top
     3-5 comments. Scrape fail → ask user paste.
4. **Assess value (reddit only).** One sentence: "do we genuinely have
   something to add here?" No → say so, stop. No filler replies.
5. **Draft to channel shape.**
   - `blog`  -  H1 (keyword-forward, human) → intro (hook + promise +
     TOC) → H2/H3s covering SERP demand + one contrarian section tied
     to positioning → inline internal-link suggestions → one CTA from
     positioning → meta description (≤155 chars) → slug (kebab-case)
     → image brief (alt text + 2-3 ideas).
   - `linkedin`  -  line 1 hook (4-10 words, contrarian / specific
     number) → whitespace, short lines → one clear takeaway →
     3-6 short paragraphs → CTA or question → 0-3 specific hashtags.
   - `x-thread`  -  tweet 1 scroll-stopping hook (≤280 chars,
     no emoji fluff) → 4-10 numbered progression tweets (each a beat,
     ≤280) → final CTA tweet (follow / reply / link). X punchier
     than LinkedIn.
   - `newsletter`  -  pick ONE through-line (can't state in
     one sentence → ask user pick headline) → subject
     (≤60 chars, specific) → preview (50-90 chars) → body of 3-5
     short sections serving through-line → one primary CTA.
     Plain-text-first, cite source URLs inline.
   - `reddit`  -  acknowledge OP's specific question (1 line) →
     concrete value 2-4 short paragraphs (framework, number, gotcha,
     step-by-step, counter-take) → optional soft mention only if
     directly relevant, after value, name not link → no
     signatures. Register shift community casual.
6. **Voice match.** Every channel respect `voice`-ledger fields
   (formality, emoji habit, sentence length). Voice sample
   flat → default direct + warm.
7. **Write atomically** to channel path (`*.tmp` → rename). Slug
   = kebab(first-5-hook-words) unless another rule above applies.
   File front-matter: `type`, `channel`, `topic`, plus channel-
   specific fields (blog: title/slug/metaDescription/targetKeyword/
   wordCount; newsletter: throughLine/sources; reddit: source URL
   + subreddit + OP quote).
8. **Blog bonus (`channel: blog` only).** `googledocs`
   connected → run `composio search googledocs` → execute
   create-doc tool, mirror draft there, include URL in
   summary.
9. **Append to `outputs.json`** at agent root. Read-merge-write
   atomically: `{ id (uuid v4), type: "blog-post" | "linkedin-post"
   | "x-thread" | "newsletter" | "community-reply", title, summary,
   path, status: "draft", createdAt, updatedAt }`.
10. **Summarize to user.** One paragraph naming hook / through-
    line / value add + path. Remind: "Review, edit, post it
    yourself."

## What I never do

- Publish / post / send on your behalf. Drafts only.
- Invent stats, customer quotes, sources. Every citable claim
  has URL or marked TBD.
- Guess positioning or voice. Read ledger + positioning file or
  ask.
- Hardcode tool names. Composio discovery at runtime only.

## Outputs

- `blog-posts/{slug}.md` | `posts/linkedin-{slug}.md` |
  `threads/x-{slug}.md` | `newsletters/{YYYY-MM-DD}.md` |
  `community-replies/{source-slug}.md`.
- Append entry to `outputs.json` with corresponding `type`.
