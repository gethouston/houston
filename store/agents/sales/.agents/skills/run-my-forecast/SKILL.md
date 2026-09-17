---
name: run-my-forecast
description: "Pull every open deal from your CRM, classify against the playbook's deal-stage exit criteria into Commit / Best / Pipeline / Omit, roll up annual revenue per bucket, and compare to last week's forecast to flag slippage. Confidence per deal is the minimum of stage progress, qualification completeness, and close-plan completeness - no gut calls."
version: 1
category: Sales
featured: no
image: handshake
integrations: [hubspot, salesforce, attio, pipedrive]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Run My Forecast

## When to use

- "build this week's forecast".
- "commit / best / pipeline rollup".
- Scheduled: Friday afternoon, before HoS review.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **CRM**  -  pull every open deal with stage, amount, target close date, owner. Required.

If your CRM isn't connected I stop and ask you to link HubSpot, Salesforce, Attio, Pipedrive, or Close from the Integrations tab.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: deal stages and exit criteria drive the per-deal confidence score, not stage names alone. If missing I ask: "I don't have your playbook yet  -  want me to draft it now?"
- **Connected CRM**  -  Required. Why I need it: every row must cite a real open deal. If missing I ask: "Connect your CRM (HubSpot, Salesforce, Attio, Pipedrive, or Close) so I can pull open deals."
- **Forecast window**  -  Optional. Why I need it: anchors what counts as Commit vs Best. If you don't specify I keep going with the current calendar quarter.

## Workflow
<!-- houston-workflow:v1 -->

1. **Read playbook.** `context/sales-context.md`. Deal stages + exit criteria drive confidence.

2. **Load open deals.** `deals.json` joined with `deals/*/close-plan.md` target-close dates.

3. **Score confidence per deal.** Confidence = min(stage-confidence, qualification-completeness, close-plan-completeness):

   - **Commit (>80%):** last stage, economic buyer + champion known, close plan all steps GREEN, date within forecast window.
   - **Best (40–80%):** mid-funnel stage, most pillars filled, close plan present but has UNKNOWNs.
   - **Pipeline (10–40%):** early stage, qualification thin.
   - **Omit (<10%):** stalled, no recent touch, or health RED unlikely to resolve.

4. **Roll up per bucket.** Count, sum annual revenue, list deals.

5. **Compare last week forecast.** Load `forecasts/{prior-week}.md`. Per deal, flag movement (up / down / unchanged / new / gone).

6. **Write forecast** to `forecasts/{YYYY-WW}.md.tmp` → rename:

   ```markdown
   # Forecast  -  Week {YYYY-WW}

   ## Commit  -  ${annual revenue} ({N} deals)
   - {Deal} · ${annual revenue} · target {date} · drivers: ...
   ## Best  -  ${annual revenue} ({N})
   ...
   ## Pipeline  -  ${annual revenue} ({N})
   ...
   ## Omit  -  ${annual revenue} ({N})
   ...

   ## Week-over-week
   - Moved UP: {Deal} from Best → Commit (champion aligned EB)
   - Moved DOWN: {Deal} from Commit → Best (legal review surprise)
   - NEW in Commit: ...
   - GONE from Commit: ...

   ## Headline
   Committed total ${X} (last week ${Y}, {delta}).
   ```

7. **Append to `outputs.json`** with `type: "forecast"`.

8. **Summarize.** Headline number + biggest week-over-week move.

## Outputs

- `forecasts/{YYYY-WW}.md`
- Appends to `outputs.json`.