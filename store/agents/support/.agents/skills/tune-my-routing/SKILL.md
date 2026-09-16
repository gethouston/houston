---
name: tune-my-routing
description: "Update the rules that decide how incoming tickets get sorted and where they go. Change what counts as a bug versus a feature request, point bugs at a new tracker, update who approves refunds, add a new category, or adjust VIP routing. Every triage after the update automatically follows the new rules."
version: 1
category: Support
featured: no
image: headphone
integrations: [googledocs, stripe, notion, github, linear]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Tune My Routing

## When to use

- "update our routing" / "fix routing" / "what's bug vs feature request."
- "we moved to {tracker}" / "refunds now go to {person}" / "add new tier."
- When `review-my-support scope=weekly` surface classification drift.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Dev tracker** (GitHub / Linear)  -  named target for the bug routing rule. Required if bug routing chains into a tracker.
- **Billing** (Stripe)  -  named target for billing routing. Optional.
- **Docs / notes** (Notion / Google Docs)  -  named target for KB or status routing. Optional.

If you want bugs to flow into a tracker I stop and ask you to connect the one you actually use.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Current routing categories**  -  Required. Why I need it: I rewrite from your existing rules, not from scratch. If missing I ask: "What buckets do you sort tickets into today  -  bug, how-to, billing, anything else?"
- **What's changing**  -  Required. Why I need it: I won't rewrite the whole section if you only meant to update one rule. If missing I ask: "What part of routing do you want to change  -  the tracker, the categories, who approves refunds, something else?"
- **Refund approver**  -  Optional. Why I need it: billing rule names a real human. If you don't have it I keep going with TBD and leave it as "founder approves."

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/support-context.md`.** If missing, run `set-up-my-support-info` first.

2. **Surface current rules to me.** Read Routing rules section, restate in 3–4 lines ("today: bug → Linear, feature request → `requests.json`, outage → `playbooks/p1-outage.md`, billing → Stripe + you approve refunds"). Ask: what changing?

3. **Capture update.** Ask ONE focused question at time  -  no whole interview. Typical updates:
   - New tracker target (moved from Linear to GitHub Issues, etc.).
   - New classification (e.g. add "security report").
   - New escalation contact.
   - Changed refund approver.
   - VIP list additions (also belong in segments section  -  update both if needed).

4. **Rewrite Routing rules section clean.** Preserve decision-tree shape. For each type, state:
   - Trigger phrases / patterns that qualify.
   - Target location (tracker slug, playbook path, dossier, chat).
   - Which skill acts (`triage-a-ticket`, `flag-a-signal`, `draft-a-playbook`, etc.).
   - What data to capture.

5. **Also update related sections** if change implies  -  VIP list (segments section), response-time tiers, known-gotchas entries referencing changed tracker. Be explicit what else touched.

6. **Write atomically** (`.tmp` → rename).

7. **Append to `outputs.json`** with `type: "routing-rules"`, `domain: "quality"`, title "Routing rules updated  -  {short reason}", summary 2 sentences on what changed, path `context/support-context.md`, status `draft`.

8. **Tell me effect.** End summary with: "Every `triage-a-ticket` and `flag-a-signal` run after this reads new rules  -  no manual re-sync."

## Outputs

- `context/support-context.md` (routing + possibly related sections updated)
- Appends to `outputs.json` with `type: "routing-rules"`, `domain: "quality"`.