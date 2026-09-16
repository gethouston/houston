---
name: set-up-my-ops-info
description: "Tell me how your company actually runs so every other ops skill stops asking the same questions. I capture your priorities for the quarter, your operating rhythm, key contacts, vendor posture, hard nos, and voice into one living doc. You only do this once and I keep it updated as things change."
version: 1
category: Operations
featured: yes
image: clipboard
x_houston:
  created_by: houston
  skill_schema: 1
---


# Set Up My Ops Info

This agent OWNS `context/operations-context.md`. No other agent writes it. This skill creates or updates it. Its existence unblocks this agent.

## When to use

- "set up our operating context" / "draft the operating doc" / "document how we work".
- "update the operating context" / "priorities changed, fix the doc".
- Called implicitly by other skill needing context doc and finds missing  -  only after confirming with user.

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox** (Gmail, Outlook)  -  Optional. Lets me sample sent messages so the voice section reflects how you actually write.
- **Calendar** (Google Calendar, Outlook)  -  Optional. Helps me infer your operating rhythm (deep-work days, meeting density).
- **Files** (Google Drive)  -  Optional. If you point me at an existing operating doc I read it before drafting.

This skill works without any connection  -  connections just make the doc richer. I never block here.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Company snapshot**  -  Required. Why I need it: every other skill leans on what you make, who it's for, and your stage. If missing I ask: "In one or two sentences, what does the company make and who is it for? And where are you today  -  pre-launch, early users, scaling?"
- **Active priorities**  -  Required. Why I need it: every weekly review and approval flow keys off these. If missing I ask: "What are the 2 to 3 things the company is pushing on this quarter?"
- **Operating rhythm**  -  Required. Why I need it: shapes brief delivery, deep-work protection, meeting load. If missing I ask: "How do you like to work  -  deep-work days, meeting days, max meetings in a day, timezone?"
- **Key contacts**  -  Required. Why I need it: anchors VIP routing and "who unblocks what." If missing I ask: "Who are your key contacts  -  lead investor, closest advisor, anchor customers, fractional legal or finance?"
- **Vendor posture**  -  Required. Why I need it: drives tone for renewals and procurement. If missing I ask: "How do you approach vendors  -  conservative, balanced, or move fast? Who can sign? Annual or monthly?"
- **Hard nos**  -  Optional. Why I need it: stops me from drafting things you'd never send. If you don't have it I keep going with TBD using the workspace defaults.

## Steps
<!-- houston-workflow:v1 -->

1. **Read config.** Load `config/company.json`, `config/rhythm.json`, `config/voice.md`. If any missing, run `onboard-me` first (or ask ONE missing piece just-in-time with best-modality hint: connected app > file > URL > paste).

2. **Read existing doc if present.** If `context/operations-context.md` exists, read so run is update, not rewrite. Preserve anything founder already sharpened; change only stale or new.

3. **Ask for pieces config can't cover.** Before drafting, ask founder concisely for:
   - **Key contacts**  -  names + role + how-to-reach for: lead investor, closest advisor, 1-2 anchor customers, fractional legal/finance, ops contractor (if any).
   - **Vendor posture**  -  risk appetite (conservative / balanced / fast), signature authority (founder only / any exec), term preference (monthly / annual / case-by-case), paper preference (ours / theirs / whatever).
   - **Hard nos**  -  anything founder-specific atop workspace-level four (never move money, never modify HRIS/payroll, never decide procurement alone, never send external without approval).
   - **Connected tools** (by Composio category, not brand)  -  inbox, calendar, team-chat, drive, meeting-recording, CRM (if any), billing (if any), web-research, news, social.

   If section thin, mark `TBD  -  {what founder should bring next}` and move on. Never invent.

4. **Draft doc (~300-500 words, opinionated, direct).** Structure, in order:

   1. **Company overview**  -  one paragraph: what we make, who for, stage, why now.
   2. **Active priorities**  -  2-3 things moving company this quarter. Approval-flow rubric + weekly review key off these.
   3. **Operating rhythm**  -  deep-work days, meeting days, review cadence, no-meeting days, timezone.
   4. **Key contacts**  -  names, roles, how to reach. Organized by category (investors, advisors, anchor customers, contractors, legal).
   5. **Tools & systems**  -  connected Composio categories + where data lives (primary drive, CRM, project tool, chat, billing).
   6. **Vendors & spend posture**  -  risk appetite, signature authority, term preferences, paper preferences.
   7. **Hard nos**  -  workspace-level four + founder-specific.
   8. **Communication voice**  -  4-6 bullets on tone, forbidden phrases, sentence-length preference. Pulled from `config/voice.md`.

5. **Write atomically.** Write to `context/operations-context.md.tmp`, then rename to `context/operations-context.md`. Single file at agent root. NOT under subfolder. NOT under `.agents/`. NOT under `.houston/<agent>/`.

6. **DO NOT append to `outputs.json`.** Doc live; not deliverable, not indexed.

7. **Summarize to user.** One paragraph: what captured, what still `TBD`, exact next move (e.g. "send me your advisor list and I'll tighten Key Contacts"). Remind them Vendor & Procurement Ops agent now has context to run.

## Outputs

- `context/operations-context.md` (at agent root  -  live document)

(No entry in `outputs.json`  -  by design.)