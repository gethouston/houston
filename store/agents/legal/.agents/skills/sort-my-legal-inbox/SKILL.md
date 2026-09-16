---
name: sort-my-legal-inbox
description: "Sweep your inbox for legal stuff (contracts to review, NDAs, customer data requests, anything that needs a lawyer's attention) and tell you what needs you and what doesn't. I just sort and summarize, I never reply."
version: 1
category: Inbox
featured: no
image: scroll
integrations: [gmail, outlook]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Sort My Legal Inbox

## When to use

- Explicit: "triage my legal inbox", "sweep inbound for contracts", "what legal email needs me", "run intake".
- Implicit: first skill the user runs when they see a "Needs you" card and ask "what's waiting on me?"
- Safe on-demand  -  daily or few times/week for solo founder. Default window: last 7 days if unspecified.

## Steps
<!-- houston-workflow:v1 -->

1. **Read shared context**: `context/legal-context.md`. If missing/empty, ask the user in plain language: "I need a few basics about your company first. Want to set those up now?" Then run `set-up-my-legal-info` if yes. Stop until that's done.
2. **Read config**: `config/counterparty-stack.json`. If your inbox isn't connected, ask the user in plain language: "I need to connect your inbox to look through it. Want to connect Gmail or Outlook now?" Stop until connected.
3. **Discover inbox tool via Composio.** Run `composio search inbox` for tool slug. Confirm slug matches `counterparty-stack.inboxCategory`.
4. **Pull inbound.** Default window: last 7 days (or user N). Query inbox slug for likely-legal messages  -  contract attachments (.pdf, .docx), law-firm sender domains, subject keywords ("NDA", "MSA", "DPA", "DSR", "subpoena", "office action", "terms", "agreement"), threads replying to prior legal inbound.
5. **Classify each item.** Apply rubric, pick one bucket:
   - **NDA**  -  traffic-light: **Green** = mutual, ≤3-year term, reasonable scope, standard non-solicit (or none), no unusual residuals, no non-compete, US governing law. **Yellow** = exactly one deviation (one-way where we sole discloser, 3-5 year term, broad residuals, adjacent jurisdiction like Canada/UK). **Red** = two+ deviations, or any of: non-compete, IP assignment, unlimited liability, publicity / press-release obligations, term >5 years or perpetual, non-standard governing law. Default Red if text not confidently parsed.
   - **MSA / order form**  -  umbrella or commercial-terms doc from customer/vendor.
   - **DPA**  -  data-processing addendum or stand-alone data terms.
   - **DSR**  -  data-subject request (GDPR Art. 15, CCPA).
   - **subpoena / legal process**  -  subpoena, preservation demand, cease-and-desist, litigation hold.
   - **TM office action**  -  USPTO office action or TM correspondence.
   - **contractor paper**  -  inbound consulting / contractor / work-for-hire from counterparty.
   - **other**  -  anything else legal-flavored (insurance-cert request, privacy inquiry, vendor security questionnaire).
6. **Route each item.** Recommend one:
   - **self-handle via `draft-a-legal-document`**  -  only if item maps cleanly to existing template (e.g. Green NDA with known counterparty).
   - **send to `review-a-contract` (mode=full)**  -  most MSA / DPA / order-form / Yellow NDAs go here.
   - **flag `attorneyReviewRequired`**  -  Red NDAs, subpoenas, litigation-adjacent, anything ambiguous.
   - **ignore**  -  spam, newsletters, resolved threads.
7. **Write** summary to `intake-summaries/{YYYY-MM-DD}.md` atomically (`*.tmp` → rename). Structure: counts at top ("7 items: 3 NDA, 1 MSA, 1 DSR, 2 other"), then one section per item with `From`, `Subject`, `Received`, `Classification`, `One-line summary`, `Recommended route`.
8. **Append to `outputs.json`**  -  read existing array, add `{ id, type: "intake-summary", title, summary, path, status: "draft", createdAt, updatedAt, attorneyReviewRequired }`. Set `attorneyReviewRequired: true` if any item flagged for attorney review.
9. **Summarize to user.** Plain language. One short paragraph: "I found {N} legal items. {X} NDAs (with the safe ones flagged), {Y} customer contracts, {Z} that need a real lawyer's eyes. Want me to draft replies for the safe ones, or fully review the customer contracts?" Never name files or paths.

## Never invent

Every classification ties to observed message. If inbox tool errored or returned no data, mark UNKNOWN in summary  -  don't guess. If attachment unparseable, say so and ask user to paste.

## Outputs

- `intake-summaries/{YYYY-MM-DD}.md`
- Appends to `outputs.json` with type `intake-summary`.