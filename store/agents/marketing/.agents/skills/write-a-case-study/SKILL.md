---
name: write-a-case-study
description: "Turn a customer win into a case study you can put on your site or hand to sales. I structure it as challenge, approach, and results with real numbers in your voice. Any number I can't verify gets flagged for you to confirm."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [notion, airtable]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Write a Case Study

## When to use

- Explicit: "draft a case study for {customer}", "write up
  {customer} story", "turn this interview into case study".
- Implicit: after SDR / sales agent flags closed-won customer
  reference-willing + founder approve.
- One case study per customer per quarter = reasonable cadence.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Notes DB (Airtable, Notion)**  -  pull the customer interview, testimonial, or notes record. Required (or you paste the source material).

If neither is connected and you can't paste the interview I stop and ask you to connect Airtable or Notion.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning**  -  Required. Why I need it: case studies have to reinforce positioning, not drift. If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes."
- **Your voice and primary CTA**  -  Required. Why I need it: closing CTA matches what every other page asks for. If missing I ask: "Connect your sent inbox so I can sample your voice, and tell me the one action a reader should take after reading the case study."
- **The customer**  -  Required. If missing I ask: "Which customer is this case study about, name plus a one-line description?"
- **The interview, testimonial, or notes**  -  Required. Why I need it: I won't fabricate quotes or metrics. If missing I ask: "Drop the interview recording, paste the testimonial, or point me at the customer record in Airtable or Notion."
- **Real before / after numbers**  -  Required for a strong case study. If missing I ask: "What measurable change did this customer see, and over what timeframe? If you don't have it I keep going with TBD."

## Steps
<!-- houston-workflow:v1 -->

1. **Read positioning doc**:
   `context/marketing-context.md`. If missing,
   stop. Tell user run `set-up-my-marketing-info` first. Case
   studies must reinforce positioning  -  no drift.
2. **Read config**: `config/site.json` (voice / brand CTAs).
3. **Locate source material.** Modality preference:
   - Connected CRM / spreadsheet via Composio  -  run `composio search
     crm` or `composio search spreadsheet` (e.g. Airtable) to find
     customer record + attached interview notes.
   - Pasted interview transcript or testimonial.
   - URL to published testimonial / review.
   If none, ask ONE question naming modalities above.
4. **Extract facts.** Build fact list:
   - Customer name, industry, size, interviewee role.
   - Challenge (specific pain, verbatim customer language
     where possible).
   - Before-state metrics (what broke, how often, what cost).
   - Approach (what they did with product  -  specific features,
     workflow changes).
   - Results (numbers, timeframe, specific outcomes).
   - Pull-quotes (verbatim, attributed).
5. **Flag missing numbers.** Any result without number gets
   TBD marker for founder verify with customer. No
   fabricate metrics.
6. **Draft case study** in classic structure:
   - Headline with headline result (e.g. "How Acme cut churn 40%").
   - One-paragraph summary.
   - Challenge section.
   - Approach section.
   - Results section (numbers upfront).
   - 2-3 pull-quotes.
   - Call-to-action matching positioning doc primary CTA.
7. **Write** to `case-studies/{customer-slug}.md` atomically, with
   front-matter block: customer, industry, headlineResult, status.
8. **Append to `outputs.json`**  -  `{ id, type: "case-study", title,
   summary, path, status: "draft", createdAt, updatedAt }`.
9. **Summarize to user**  -  headline result, any TBD numbers
   need founder/customer confirmation, path.

## Never invent

Never fabricate customer quote, metric, or outcome. If source
no have data, mark TBD. Push back if founder want
"round up" number into something cleaner than reality.

## Outputs

- `case-studies/{customer-slug}.md`
- Appends to `outputs.json` with type `case-study`.
