---
name: repurpose-my-content
description: "Turn something you already have into something new. Give me a blog post, a YouTube video, an article, or a competitor post, and tell me the target format. I reshape it for the new channel in your voice. No plagiarism, no generic-ify."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [linkedin, twitter, youtube, firecrawl]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Repurpose My Content

## When to use

- Explicit: "turn this blog post into LinkedIn posts", "repurpose this YouTube video into a blog draft", "make an X thread from this article", "pull shareable insights from {URL}".
- Implicit: after `write-a-post` lands big post, founder asks for social derivatives.
- Many source × target combos  -  pick format dynamic from user ask.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Web scrape (Firecrawl)**  -  optional when the source is a URL. If not connected I fall back to basic HTTP fetch, rougher but works on static blog posts and articles.
- **YouTube**  -  pull the transcript and metadata. Required when the source is a YouTube video  -  no fallback, transcripts need the API.
- **Social platforms (LinkedIn, X)**  -  optional, only if the source is a post on one of them.

If the source is a YouTube video and YouTube isn't connected I stop. For a URL source, I keep going on basic HTTP fetch and flag if the page is JS-heavy enough that the result is thin.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning and voice**  -  Required. Why I need it: repurposed content has to sound like you, not the original author. If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes. And connect your sent inbox so I can sample your voice."
- **The source**  -  Required. If missing I ask: "What am I repurposing, paste the URL, drop the YouTube link, or paste the article text."
- **The target format**  -  Required. If missing I ask: "What do you want me to turn it into, five LinkedIn posts, an X thread, a newsletter, a blog draft, or a list of shareable insights?"

## Steps
<!-- houston-workflow:v1 -->

1. **Read positioning doc**: `context/marketing-context.md`. If missing, stop and tell user run `set-up-my-marketing-info` first. Voice and positioning load-bearing for repurposed content.
2. **Read config**: `config/site.json` and `config/tooling.json`.
3. **Parse source + target** from user ask. Source can be:
   - Blog/article URL → fetch via `composio search web` or scrape tool.
   - YouTube URL → run `composio search youtube` to find transcript tool; fetch transcript + metadata.
   - Pasted article or transcript text.
   - Competitor blog URL (legal repurpose: insight + credit).
4. **Ingest source.** Pull full text (or transcript). Extract:
   - Thesis / core argument.
   - 5-10 distinct insights.
   - Quotable lines.
   - Concrete examples / numbers.
5. **Transform to target format.** Apply right template:
   - **LinkedIn posts** (default: 5 variants)  -  hook + value + CTA; each under 1300 chars; one hero quote or stat per post.
   - **X thread**  -  1 hook tweet + 6-12 body tweets; each ≤ 280 chars; thread-close CTA.
   - **Newsletter**  -  subject + preheader + 300-600 word body + clear CTA.
   - **Blog draft**  -  H1/H2 structure matching `write-a-post` (shorter, 800-1200 words for YouTube → blog).
   - **Shareable insights**  -  bulleted insight-card list, each with quote and insight in one line.
   Match voice from positioning doc; no generic-ify.
6. **Write** to `repurposed/{source-slug}-to-{target}.md` atomic. Front-matter: sourceUrl, sourceType, targetFormat, status.
7. **Append to `outputs.json`**  -  `{ id, type: "repurposed", title, summary, path, status: "draft", createdAt, updatedAt }`.
8. **Return content in chat.** Always paste the full repurposed content into the chat reply, not just a summary. The user must be able to read, copy, and share the draft without opening any file. Format:
   - One-line lead-in saying what was made (e.g. "Here's the blog draft." / "Here are the 5 LinkedIn posts." / "Here's the X thread.").
   - Full content, rendered in markdown, with each variant clearly separated (`---` between LinkedIn posts, numbered tweets in a thread, full body for a blog).
   - For multi-variant outputs (LinkedIn, headlines, ad copy), label each variant (`**Post 1**`, `**Post 2**`, …).
   - End with a short closing line  -  one sentence on the strongest hook or the angle you leaned into, and an invitation to refine ("Want me to tighten any of them, swap angle, or add more variants?").
   - Never reply with only a file path or "saved to your drafts"  -  the content always rides in the chat itself.

## Never invent

If source no say, no put in repurposed piece. Rewriting competitor post (legal repurpose): credit source explicit and transform framing big  -  never plagiarize.

## Outputs

- `repurposed/{source-slug}-to-{target}.md`
- Appends to `outputs.json` with type `repurposed`.
