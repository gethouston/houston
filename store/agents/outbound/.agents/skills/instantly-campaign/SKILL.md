---
name: instantly-campaign
description: "Create a paused cold email campaign in Instantly with all leads loaded and all sending accounts attached. I read your locked sequence, sanitize bodies (Instantly drops bodies that contain a literal ampersand - documented bug), bulk-load up to 1000 leads per call, and configure the schedule with a timezone Instantly accepts (America/Vancouver for Pacific, handles DST automatically). Always paused for your review - never auto-launched."
version: 1
category: Outbound
featured: no
image: rocket
integrations: [instantly]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Instantly Campaign

Create a fully-loaded, **paused** cold email campaign in Instantly. I take a locked sequence file plus a verified-contacts file, build the campaign through the Instantly REST API, work around two known bugs (timezone enum restrictions and the ampersand body-drop bug), bulk-load all the leads in one call, and attach every connected sending account. The campaign always ends in `paused` status. You hit Activate when you're ready.

## When to use

- "Load this sequence into Instantly: <sequence file>".
- "Create the Instantly campaign for this list".
- Phase 5 of either LinkedIn pipeline.
- You have a locked sequence and a verified contact list and want them sending.

## When NOT to use

- The sequence isn't locked yet  -  finish `cold-email-sequence` first.
- The contact list doesn't have verified emails yet  -  run `apollo-enrichment` first.
- You want to **edit** an existing campaign  -  Instantly's dashboard handles that. I create new campaigns; I don't mutate live ones.
- You want a **warm** email send (one-off to a specific person)  -  use Gmail / Outlook directly, not a cold email platform.

## Connections I need

- **Instantly** (sending platform) - Required. I create the campaign, load leads, attach accounts, configure schedule.

If Instantly isn't connected I stop and ask you to connect it.

## Information I need

- **The locked sequence file** - Required. Path to a `.md` file produced by `cold-email-sequence`. If missing I ask: "Where's the locked sequence file? It should be in your `sequences/` folder."
- **The verified-contacts file** - Required. Path to the `contacts.json` produced by `apollo-enrichment`. If missing I ask: "Where's the contacts file? It should be in `runs/{runId}/contacts.json`."
- **A campaign name** - Optional. Defaults to deriving from the sequence file name (e.g. `2026-05-05-jane-doe-revops-sequence.md` becomes `LinkedIn - Jane Doe RevOps`). Override per call.
- **Sending accounts to attach** - Optional. Defaults to "all connected sending accounts in your Instantly workspace". Override per call if you want only specific ones.
- **Schedule** - Optional. Defaults from `config/context-ledger.json` (default `America/Vancouver`, Mon-Fri, 8-5).

## Steps
<!-- houston-workflow:v1 -->

1. **Read inputs.** Parse the sequence file into `{subject, body}` per email. Read the contacts file into a list of `{firstName, fullName, email, company, title, linkedinUrl, personalizationFields}`. Sanity-check that every email is non-empty and every body is non-empty.

2. **Sanitize bodies.** **Strip every `&` character from each email body.** Instantly's body-store quietly drops bodies that contain a literal ampersand  -  the campaign creates fine, but the body uploads as empty and your campaign sends blank emails. Replace `&` with `and`. Document this in the Instantly campaign description so future-you remembers why.

3. **List sending accounts.** Call Instantly's `list_accounts` via Composio. If the user named specific accounts, filter to those. If "all" (the default), keep them all.

4. **Pick a schedule.** Use the schedule from `config/context-ledger.json` defaults. The timezone field is the easy one to get wrong  -  Instantly's timezone enum is restricted and doesn't accept all `IANA` zones. Safe choices:
   - **Pacific**: `America/Vancouver` (handles US Pacific DST automatically and is on Instantly's accepted list).
   - **Eastern**: `America/Toronto`.
   - **Central European**: `Europe/Berlin`.
   - If the context ledger has a timezone Instantly rejects, fall back to `America/Vancouver` and surface the substitution in the run notes.

5. **Create the campaign.** POST to Instantly's `create_campaign` endpoint with:
   - Name = derived (or user-provided).
   - Steps = 3, with day offsets 0 / 3 / 7 matching the sequence file.
   - Bodies = sanitized in step 2.
   - Schedule = picked in step 4.
   - Status = `paused` (always - never `active`, even if the API allows it).

6. **Verify all step bodies are non-empty after create.** Re-fetch the new campaign via `get_campaign` and assert that each step's body is non-empty. If any step is empty, raise loudly  -  the ampersand bug bit you despite the sanitization, or there's a different field that got dropped. Do not proceed to the load step.

7. **Bulk-load leads.** POST to Instantly's `add_leads_to_campaign` with the verified contacts. Instantly accepts up to 1000 leads per call - if you have more, page in chunks of 1000. Per-lead fields:
   - `email` (required).
   - `first_name` (required for the `{{firstName}}` merge field).
   - `last_name`.
   - `company`.
   - `title`.
   - `personalization` (optional, only populated for reaction-source contacts where `personalizationFields` is non-empty).
   - `linkedin_url` (helpful but not required).

8. **Attach sending accounts.** POST to Instantly's `attach_accounts_to_campaign` with the accounts from step 3. Attaching all connected accounts is the default; Instantly rotates sends across them, which improves deliverability vs. a single account.

9. **Confirm paused status.** Re-fetch the campaign one more time. Assert `status: "paused"`. If anything other than paused, log loudly to the run notes and surface to the user  -  Instantly should never auto-activate but if a default config slipped through, the user needs to know immediately.

10. **Append to `campaigns.json`.** One row: `{name, instantlyCampaignId, sequenceFile, leadCount, sendingAccounts, schedule, status: "paused", createdAt}`.

11. **Update `leads.json`.** For every loaded lead, set `loadedToCampaignId: instantlyCampaignId` on the matching `email` row. Read-merge-write atomically.

12. **Append to `outputs.json`.** One row: `{type: "campaign", title: "{Campaign name}", summary: "Campaign created in Instantly with {leadCount} leads, {accountCount} sending accounts. Status: PAUSED.", path: null, status: "paused", domain: "sending"}`. The `path: null` because the campaign lives in Instantly, not on disk.

13. **Final summary to user.**
    - Campaign name + status (paused).
    - Leads loaded.
    - Sending accounts attached.
    - Schedule (e.g. "Mon-Fri, 8-5 Pacific via America/Vancouver - handles DST automatically").
    - Direct link to the campaign in the Instantly dashboard.
    - "Review in Instantly. Activate when you're ready - I won't do it for you."

## Outputs

- New Instantly campaign (paused) with 3 email steps, all leads loaded, all sending accounts attached.
- `campaigns.json`  -  one row.
- `leads.json`  -  `loadedToCampaignId` set on every loaded lead.
- `outputs.json`  -  one row, `type: "campaign"`, `status: "paused"`, `domain: "sending"`.

## Common failure modes

| Failure | Why | Fix |
|---|---|---|
| Empty body on Instantly side after upload | A literal `&` was in the email body | The sanitize step strips them; if it slipped through (e.g. inside a URL), strip again and verify with `get_campaign` |
| Timezone rejected by `create_campaign` | Instantly's timezone enum is restricted | Use `America/Vancouver` (Pacific), `America/Toronto` (Eastern), `Europe/Berlin` (Central European); avoid `Etc/GMT*` |
| 401 on `add_leads_to_campaign` | Instantly token expired in Composio | User reconnects Instantly from the Integrations tab |
| Lead count loaded < expected | Instantly silently rejected duplicates (same email already in another campaign) | This is correct behavior; surface the diff in the run notes so the user sees which leads were skipped and why |
| Campaign created with `status: "active"` | I forgot to set `status: "paused"` on create | Always set explicitly; never trust the API default |

## What I never do

- **Activate the campaign.** Always paused. The user hits Activate in the Instantly dashboard. Even if the orchestrator passes a flag asking for active, I refuse - this is a hard rule, not a default.
- **Skip the sanitize step.** Bodies always pass through ampersand-stripping before upload, even if the body looks clean.
- **Skip the verify step.** I always re-fetch the campaign after create and after load to confirm bodies are non-empty and status is paused.
- **Mutate an existing live campaign.** I create new campaigns. Editing live ones is the user's job in the Instantly dashboard.
- **Hardcode the campaign create / load / verify endpoint names.** All discovered via Composio at runtime.
