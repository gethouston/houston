---
name: mine-my-tickets
description: "Go through your recent tickets and pull out what customers are actually saying. Clusters the verbatim pains, feature requests, friction points where your messaging doesn't match reality, and quotes worth stealing for your landing page. The single best input for your next roadmap conversation, positioning tweak, or investor update."
version: 1
category: Support
featured: yes
image: headphone
integrations: [gmail]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Mine My Tickets

Different from `flag-a-signal signal=repeat-question`. That skill outputs KB-gap candidates (operational view). This one outputs strategic voice-of-customer report (product/positioning view). Same source data, different consumer.

## When to use

- "mine the last {N} tickets for themes."
- "what are customers asking for?"
- Before writing roadmap, landing-page update, or investor update.
- Ad hoc strategic-research requests.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox** (Gmail)  -  source of customer threads when `conversations.json` doesn't cover the window. Optional if local data is current.
- **Support helpdesk** (Intercom / Zendesk / Help Scout)  -  alternate ticket source. Optional.

If neither is connected and the local conversation index is thin I stop and ask you to link your inbox or helpdesk so I have enough signal.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Current positioning**  -  Required. Why I need it: I flag friction by comparing real customer language against what you claim. If missing I ask: "How do you describe what the product does today  -  share your homepage URL or one paragraph?"
- **Time window**  -  Required. Why I need it: 30 days is the default but I'll widen or narrow if you want. If missing I ask: "How far back should I look  -  last 30 days, last quarter, since launch?"
- **Segment filter**  -  Optional. Why I need it: lets me cluster by customer type instead of mixing everything. If you don't have it I keep going with TBD and surface mixed clusters.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/support-context.md`.** For current positioning + VIP list. If missing, run `set-up-my-support-info` first.

2. **Set window.** Default: last 30 days. Ask if different window wanted.

3. **Read conversation data.**
   - `conversations.json`  -  filter to window.
   - Each conversation, read `conversations/{id}/thread.json` for actual message content. Prefer customer's own messages, not your replies.
   - Skip bot-looking or obviously-not-signal messages.

4. **Read help-center signal.**
   - `requests.json`  -  feature requests in window, with attribution.
   - `patterns.json`  -  already-detected repeat-question themes.
   - Use these to sanity-check clusters and attribute requests.

5. **Extract signal.**
   - **Pains (top 5):** cluster verbatim complaint phrases. Rank by frequency. Each, keep 2-3 verbatim quotes (redacted identifiers).
   - **Feature asks (top 5):** cluster requests. Rank by count of distinct customers asking (not total mention count). Note which VIPs in each cluster.
   - **Friction phrases:** sentences contradicting current positioning (e.g. positioning claims "easy to set up" but 5 customers described setup as "confusing"  -  flag it).
   - **Positioning-worthy quotes:** 2-3 verbatim lines good for landing-page copy, with customer-type attribution.
   - **Emerging shapes:** things maybe unnoticed  -  e.g. "3 different SMB customers asked about the API this week."

6. **Draft report.** Markdown, ~500-700 words. Structure:

   ```markdown
   # Voice of Customer  -  {window}

   **Window:** {start} → {end}
   **Source:** {N} conversations, {N} feature requests
   **Context doc version:** based on `context/support-context.md` as of {date}

   ## Top 5 pains (ranked by frequency)

   1. **{Pain name}**  -  {count} instances
      > "{verbatim quote 1}"
      > "{verbatim quote 2}"
      *Affects: {segments or VIPs}*

   2. … (repeat)

   ## Top 5 feature asks (ranked by distinct requesters)

   1. **{Feature}**  -  {N} distinct customers including {VIP-if-any}
      *Linked requests:* {paths into requests.json}
   2. …

   ## Friction with current positioning

   {2-4 items where language in tickets contradicts the
   positioning in context/support-context.md. Each item: the claim, the
   contradicting quotes, a specific edit we could make.}

   ## Positioning-worthy quotes

   - "{quote}"  -  {customer type}
   - "{quote}"  -  {customer type}
   - "{quote}"  -  {customer type}

   ## Emerging shapes

   {2-4 bullets on patterns you might not have noticed.}

   ## Recommended next moves

   1. **Send to marketing/product:** {specific quote or pain}
   2. **Update positioning:** {one friction point worth fixing}
   3. **Build/prioritize:** {one feature cluster}
   ```

7. **Write to `voc/{YYYY-MM-DD}.md`** atomically.

8. **Append to `outputs.json`** with `type: "voc-synthesis", domain: "quality"`, title = "voice-of-customer  -  {window}", summary = top pain + top ask, path, status `ready`.

9. **Summarize to me.** Headline: single biggest pain + single biggest ask + 3 positioning-worthy quotes copy-pasted inline. Offer to chain into `review-my-support scope=weekly` so next Monday review pulls insight forward.

## Outputs

- `voc/{YYYY-MM-DD}.md`
- Appends to `outputs.json` with `type: "voc-synthesis", domain: "quality"`.
