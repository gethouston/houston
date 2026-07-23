---
name: monitor-competitor
description: "Add a company to your watchlist and I'll check in on them every week. Pricing changes, new features, funding news, hiring spikes — I surface it when something actually changed. Silent weeks mean nothing moved."
version: 1
category: Research
featured: no
image: bell
integrations: [perplexityai, firecrawl, linkedin]
---


# Monitor Competitor

## When to use

- "watch {company}"
- "monitor {competitor}"
- "alert me when {company} does X"
- "add {company} to my watchlist"
- "track {competitor} for changes"

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **AI search** (Perplexity)  -  pulls recent news and changes. Required.
- **Web scraping** (Firecrawl)  -  scrapes homepage, pricing, blog for diffs against baseline. Optional but strongly recommended.
- **Professional network** (LinkedIn)  -  headcount changes, key hires. Optional.

If no Perplexity connected I stop and ask you to link it from the Integrations tab.

## Information I need

I read your research context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The company to monitor**  -  Required. If missing I ask: "Which company should I add to your watchlist?"
- **Focus areas**  -  Optional. Default: all (pricing, features, hiring, funding, press). Override: "just pricing and features" narrows what I check.

## Steps (adding to watchlist)

0. **Read `config/context-ledger.json`** and **`watchlist.json`**. Check if company already on list.
1. **If already on list**: tell user "{company} is already on your watchlist, added {date}. Want me to update the focus areas or run a check now?"
2. **If not on list**: run `profile-a-competitor` inline to get baseline. Save baseline snapshot path.
3. **Add entry to `watchlist.json`**: slug, name, url, `added_at: today`, `last_checked: null`, `baseline_path`, optional `focus_areas` array (pricing / features / hiring / funding / press).
4. **Append to `outputs.json`** with `type: "watchlist-add"`, `domain: "monitoring"`.
5. **Confirm to user in chat**: "I've added {company} to your watchlist. I'll check in weekly and only surface changes."

## Steps (weekly check  -  run by routine, documented for routine use)

1. For each entry in `watchlist.json` where `last_checked` is null or older than 7 days:
2. **Re-scrape** homepage + pricing page + blog (last 3 posts) via Firecrawl (discover slug with `composio search firecrawl`).
3. **Pull last 7 days news** via Perplexity: `"{company}" (launch OR pricing OR funding OR hire OR acquisition)`.
4. **Pull LinkedIn signals** (if connected): current headcount, compare to baseline.
5. **Diff against baseline**: what changed? New blog posts, pricing page edits, headcount spikes, news items.
6. **If something changed**:
   - Write update to `watchlist-updates/{slug}-{YYYY-MM-DD}.md` with diff details and sources.
   - Append to `outputs.json` with `type: "watchlist-update"`, `domain: "monitoring"`.
   - Update `watchlist.json`: `last_checked: today`, `last_changed: today`.
   - Surface in chat.
7. **If no change**:
   - Update `watchlist.json`: `last_checked: today`. Stay silent.

## Outputs

- Upserts: `watchlist.json` (watchlist entry)
- Writes: `watchlist-updates/{slug}-{YYYY-MM-DD}.md` (change report, only when changes found)
- Appends: `outputs.json` with `type: "watchlist-add"` or `type: "watchlist-update"`

## Source integrity rules

- Every change reported cites what changed, when, and source URL.
- "No change" means the scrape ran and nothing differed  -  not that the scrape failed.
- Scrape failures are reported honestly as "unable to check"  -  never assumed as "no change."
