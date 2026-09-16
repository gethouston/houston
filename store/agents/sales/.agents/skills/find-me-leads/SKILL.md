---
name: find-me-leads
description: "Surface fresh leads in a segment from a source you pick: your CRM closed-won lookalikes, a LinkedIn comment thread, a recent-funding feed, a Google Maps search, or a subreddit. I quick-score each against your playbook's hard disqualifiers and only keep GREEN and YELLOW. Every row cites the trigger signal that surfaced them."
version: 1
category: Sales
featured: yes
image: handshake
integrations: [hubspot, salesforce, attio, linkedin, twitter, reddit, firecrawl]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Find Me Leads

Surface net-new leads in segment.

## When to use

- "find me {N} leads in {segment}".
- "surface leads I can reach out to this week".
- "compile leads from {LinkedIn post / subreddit / event}".
- Scheduled: weekly prospecting routine.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **CRM**  -  expand from lookalikes of your closed-won accounts. Required if you pick that source.
- **Social**  -  pull commenters from a LinkedIn post or thread. Required if you pick that source.
- **Search / research**  -  pull recent-funding or recent-hire signals. Required if you pick that source.
- **Scrape**  -  parse a Google Maps results page or a subreddit. Required if you pick that source.

If none of the source categories are connected I stop and ask you to connect at least one (CRM is the strongest place to start because closed-won lookalikes convert best).

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: I need your ideal customer profile and disqualifiers to quick-score candidates honestly. If missing I ask: "I don't have your playbook yet  -  want me to draft it now?"
- **The segment you want leads in**  -  Required. Why I need it: "leads" is too broad to filter against your ideal customer profile. If missing I ask: "Which segment should I pull from  -  industry, company size, role, geography?"
- **How many leads you want**  -  Required. Why I need it: caps the search and the file. If missing I ask: "How many leads do you want me to surface  -  10, 20, 50?"
- **Where to source from**  -  Required. Why I need it: each source uses a different connected tool. If missing I ask: "Should I expand lookalikes from your CRM, pull commenters from a LinkedIn post, scan a recent-funding feed, scrape a Google Maps area, or surface a subreddit thread?"

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + playbook.** Gather missing required fields
   (ONE question each, best-modality first). Write atomically.

2. **Pick source.** Based on segment + user intent, ask
   which source (unless named):
   - **Connected CRM**  -  expand from lookalike of closed-won.
   - **LinkedIn comment thread**  -  paste post URL; compile
     commenters.
   - **Search engine / funding feed**  -  recent-funding or
     recent-hire signals in segment.
   - **Google Maps**  -  local-biz segments.
   - **Subreddit / community**  -  recent high-engagement posts.

3. **Pull candidates.** Via `composio search <category>` per picked
   source. Cap ~3× requested count for filtering.

4. **Per-candidate quick-score**  -  apply playbook's hard
   disqualifiers. Drop RED. Per surviving candidate, capture:
   - Company + LinkedIn / website URL.
   - Primary contact name + title + LinkedIn (if available).
   - Trigger signal that surfaced them (hiring post, Series B,
     commented on X thread, 4.8-star review  -  cite specifically).
   - Quick fit: GREEN / YELLOW (skip RED  -  dropped).

5. **Write batch file** to `leads/batches/{segment-slug}-{YYYY-
   MM-DD}.md` (atomic `*.tmp` → rename)  -  query, source, date, lead
   list with trigger signals cited.

6. **Append to `leads.json`.** Per surviving candidate, append
   new row with `status: "new"`, `source` (slug of this
   search), `fitScore` (GREEN/YELLOW). No duplicates  -  check
   existing rows by company + name. Read-merge-write atomic.

7. **Append to `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "lead-batch",
     "title": "Leads  -  {segment}",
     "summary": "<N leads surfaced from {source}. Top signal: {signal}.>",
     "path": "leads/batches/{segment-slug}-{date}.md",
     "status": "ready",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>",
     "domain": "outbound"
   }
   ```

8. **Summarize to user.** Top 3 leads inline + full file
   path. Suggest: "`research-an-account depth=enrich-contact` on #1
   next?" or "`score-my-pipeline subject=lead-fit` in bulk across these?".

## What I never do

- Invent leads, names, titles, trigger signals. Every lead ties
  to real tool response or URL observation.
- Contact anyone or push leads into CRM without approval.
- Hardcode tool names  -  Composio discovery at runtime only.

## Outputs

- `leads/batches/{segment-slug}-{YYYY-MM-DD}.md`
- Appends to `leads.json` (new rows only).
- Appends to `outputs.json` with `type: "lead-batch"`,
  `domain: "outbound"`.