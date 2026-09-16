---
name: track-compliance-deadlines
description: "Keep a living people-compliance calendar  -  I-9 / W-4 status, visa renewals, vesting cliffs, review-cycle dates, policy-refresh cadence. I scan your HR system, update the calendar in place, and nudge you before things expire."
version: 1
category: People
featured: no
image: busts-in-silhouette
integrations: [googlesheets, notion]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Track Compliance Deadlines

## When to use

- Explicit: "build the compliance calendar", "what's coming up in HR compliance", "what I-9 / W-4 / visa renewals are due", "refresh the compliance calendar".
- Implicit: routed monthly, or new hire finishes onboarding (new I-9 deadline), or visa date recorded.
- Frequency: on-demand + monthly refresh.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **HR platform (Gusto, Deel, Rippling, Justworks)** — pull start dates, work-authorization, vesting. Required.
- **Calendar (Google Calendar, Outlook)** — push date reminders if you want them on your calendar. Optional.
- **Sheets (Google Sheets, Airtable)** — mirror the calendar for finance or ops if needed. Optional.
- **Docs (Notion)** — share the calendar in your team workspace. Optional.

If your HR platform isn't connected I stop and ask you to link Gusto, Deel, Rippling, or Justworks from the Integrations tab.

## Information I need

I read your people context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Roster with start dates and statuses** — Required. Why I need it: every entry traces to an employee record. If missing I ask: "Connect your HR platform so I can pull start dates and work-authorization, or paste the team list with these fields."
- **Review cycle rhythm** — Required. Why I need it: review-cycle anchors are part of the calendar. If missing I ask: "Are reviews annual, semi-annual, or quarterly, and when does the next cycle start?"
- **State registration footprint** — Optional. Why I need it: state filings depend on where employees live. If you don't have it I keep going with TBD on state entries.
- **Equity vesting policy** — Optional. Why I need it: cliff dates and acceleration drive 30-day notices. If you don't have it I keep going with TBD on equity entries.
- **PTO refresh date** — Optional. Why I need it: anchors the annual PTO refresh entry. If you don't have it I keep going with TBD.

## Steps
<!-- houston-workflow:v1 -->

1. **Read people-context doc.** Read `context/people-context.md` for review-cycle rhythm (annual / semi-annual / quarterly, next cycle date) + any policy-refresh cadence. If missing/empty, tell user: "I need the people-context doc first  -  run the set-up-my-people-info skill." Stop.
2. **Read ledger.** `config/context-ledger.json` (HR platform read-only  -  never modify records). If HR platform not connected, ask ONE targeted question with modality hint ("Connect your HR platform  -  Gusto, Deel, Rippling, or Justworks  -  in the Integrations tab so I can pull start dates, work-authorization status, and vesting schedules").
3. **Discover tools via Composio.** Run `composio search hris` for read-only profile slug + `composio search calendar` for calendar tool to push reminders if user wants.
4. **Scan employee records (read-only).** Per employee, pull:
   - Start date (I-9 3-day rule reference).
   - W-4 last-refreshed date.
   - Work-authorization / visa expiration (if applicable).
   - Equity vesting start + cliff date + acceleration terms (if applicable).
   - Review-cycle anchor date vs rhythm in people-context.
5. **Produce calendar entries per category:**
   - **I-9 deadlines**  -  3-day rule. Flag anyone still in 3-day window.
   - **W-4 refresh timing**  -  annual refresh anchors.
   - **Visa expirations**  -  90 / 60 / 30 day warnings per employee.
   - **State registration requirements**  -  per-state obligations from new-state hires.
   - **Review-cycle dates**  -  derived from rhythm in people-context.
   - **Equity vesting cliffs**  -  notify 30 days pre-cliff.
   - **PTO policy refresh dates**  -  annual / fiscal refresh.
6. **Update living doc.** Write full refreshed calendar atomically to `compliance-calendar.md` at agent root (NOT subfolder)  -  write `compliance-calendar.md.tmp`, rename over existing file. Structure: one section per category above, entries sorted by date ascending, each entry carrying `{ employee-slug (if applicable), due-date, days-out, action }`. Top-of-file "Refreshed: {timestamp}" line.
7. **Append to `outputs.json`**  -  read existing array, add new entry per refresh: `{ id, type: "compliance", title: "Compliance calendar refresh {YYYY-MM-DD}", summary, path: "compliance-calendar.md", status: "ready", createdAt, updatedAt }`. Each substantive refresh = NEW outputs.json entry  -  file at agent root overwritten, but outputs log append-only so dashboard shows history. Write atomically.
8. **Summarize to user**  -  one paragraph: count of entries per category, nearest-term action, path to `compliance-calendar.md`. Offer to push date reminders to connected calendar tool.

## Never invent

Every entry ties back to a real HR platform record or real people-context anchor. Field missing → mark TBD. Don't guess date.

## Never mutate

HR platform / payroll records read-only from this agent. Skill reads, scans, produces markdown calendar  -  never writes back to the HR platform.

## Outputs

- `compliance-calendar.md` at agent root (living doc, updated atomically in place).
- Appends to `outputs.json` with type `compliance` per refresh  -  dashboard shows refresh history even though calendar file overwritten.