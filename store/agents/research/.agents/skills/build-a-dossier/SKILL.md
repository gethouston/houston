---
name: build-a-dossier
description: "Give me a person or company before a sales call, partnership meeting, or investor pitch. I'll build a meeting-ready brief: background, recent activity, likely priorities, shared connections, and 3 talking points tailored to what they care about. Ready in under 5 minutes."
version: 1
category: Research
featured: yes
image: memo
integrations: [firecrawl, perplexityai, linkedin, gmail]
---


# Build a Dossier

## When to use

- "research {person} before my call"
- "prep me for {name}"
- "dossier on {company} before my meeting"
- "who am I talking to at {company}"
- Implicit: before any meeting mentioned in chat where a name or company appears.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Web research** (Firecrawl / Perplexity)  -  core research tool. Required.
- **Professional network** (LinkedIn)  -  pulls career history, recent posts, mutual connections. Optional but strongly recommended.
- **Email** (Gmail)  -  if connected, I check your sent/received history with this person/company and surface prior context so you don't repeat yourself. Optional.

If no web research tool is connected I stop and ask you to link Perplexity or Firecrawl from the Integrations tab.

## Information I need

I read your research context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Who to research**  -  Required. Person name, LinkedIn URL, company name, or meeting invite. If missing I ask: "Who's the meeting with? Give me a name, LinkedIn link, or company name."
- **Purpose of the meeting**  -  Optional. Default: assume sales/partnership. Override: "investor pitch" or "hiring call" changes which talking points I generate. If missing and not obvious I ask: "What's the meeting for, sales, partnership, hiring, or something else?"
- **Your context to personalize talking points**  -  Optional. If `config/context-ledger.json` has your company + ICP, I use it. If no stored context, I skip personalized angle and produce a generic research-backed brief.

## Steps

0. **Read `config/context-ledger.json`.** Load `universal` (your company context) and `domains.prospects`. Check Gmail (via `composio search gmail`) for prior thread history with this person/company if connected.
1. **Resolve subject.** Is it a person or a company?
   - **Person**: extract name + current company + role. If only name given, use Perplexity to find LinkedIn profile. Save slug = `{firstname}-{lastname}`.
   - **Company**: use existing `competitors.json` profile if available and fresh. Save slug = kebab-cased company name.
2. **For a person:**
   - Pull LinkedIn profile via Composio (if connected): current role, past 3 roles, education, recent posts (last 5).
   - Pull Perplexity: recent mentions, interviews, talks, articles published by or about them.
   - Check Gmail history: any prior threads? Surface most recent 2.
   - Extract: career narrative arc, recent public statements (what they care about publicly), likely priorities based on role + recent activity.
3. **For a company:**
   - Run `profile-a-competitor` inline if no fresh profile in `competitors.json`.
   - Also pull: recent press releases, leadership team (LinkedIn via Composio), any known customer logos (signals on their website).
4. **Generate 3 tailored talking points.**
   - Grounded in: their stated priorities (from recent posts/articles) + your company's value prop (from context-ledger).
   - Format: "They care about X → lead with Y."
   - If no company context stored, generate 3 generic but research-backed openers instead.
5. **Compile dossier** with sections:
   - **Who they are**  -  role, background, career arc (2-3 sentences).
   - **What they've been saying lately**  -  2-3 recent public signals with dates and sources.
   - **Likely priorities**  -  inferred from role + recent activity.
   - **Your history with them**  -  prior email threads if Gmail connected; "No prior contact" if not.
   - **3 talking points**  -  personalized to the meeting purpose.
   - **Quick facts**  -  company size, funding stage, tech stack if visible.
6. **Write dossier** to `dossiers/{slug}-{YYYY-MM-DD}.md`.
7. **Upsert** in `prospects.json`: slug, name/company, `last_researched: today`, meeting purpose, path.
8. **Append to `outputs.json`** with `type: "dossier"`, `domain: "prospects"`, title = person/company name, path.
9. **Summarize in chat**: one paragraph  -  who they are, what they care about, and your single best opening line. Never mention files or paths.

## Outputs

- Writes: `dossiers/{slug}-{YYYY-MM-DD}.md` (full meeting-ready brief)
- Upserts: `prospects.json` (index entry)
- Appends: `outputs.json` with `type: "dossier"`, `domain: "prospects"`

## Source integrity rules

- Every claim cites a source URL + date inline.
- Prior email content stays confidential  -  summarize themes, never quote emails in the dossier file.
- Flag anything unverified with "(unconfirmed)".
- Never invent a mutual connection.
