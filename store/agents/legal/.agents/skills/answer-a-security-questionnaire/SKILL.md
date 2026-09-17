---
name: answer-a-security-questionnaire
description: "A big customer sent you a security questionnaire? I read it, fill in everything I already know about your company, and group the rest by topic so you can knock out many in one sitting. Every answer I save reuses next time, so the second one is much faster than the first."
version: 1
category: Compliance
featured: no
image: scroll
integrations: [googlesheets, googledocs, googledrive, airtable]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Answer a Security Questionnaire

## When to use

- Explicit: "help me with this security questionnaire", "fill out vendor security assessment", "triage this SIG / CAIQ", "what can you answer on this questionnaire", "enterprise prospect sent me this security doc".
- Implicit: `sort-my-legal-inbox` classified inbound as "other → vendor security questionnaire" and founder wants action.
- One questionnaire per invocation. Multiple → call once each.

## What this is (and isn't)

**Triage + draft**  -  fast question-set extraction, auto-fill from founder's persisted answers library, grouped "still-need-from-you" list so one sit-down resolves many. **Not** full security program audit, **not** final sign-off. Every output closes with "this is summary, not legal advice; enterprise security questionnaires sometimes imply contractual commitments  -  escalate anything with commercial impact to outside counsel."

## The answers library

`config/security-answers.md` = founder's persistent, growing security-program answers library. Accumulates over time  -  every new questionnaire potentially adds answers. Flat markdown, topic headers + Q/A pairs:

```markdown
## Access control
**Q: Do you enforce MFA on all admin accounts?**
A: Yes  -  MFA required on all production infrastructure (AWS,
   {password-manager}, {git-host}) via {provider}. Enforced since
   {YYYY-MM}.

## Data at rest
**Q: Is customer data encrypted at rest?**
A: Yes  -  AES-256 at rest via {provider}'s managed encryption on all
   customer data stores.

...
```

Topic buckets (customize if questionnaire deviates): access control, authentication, data at rest, data in transit, data residency, subprocessors, backups + DR, incident response, secure SDLC, vulnerability management, logging + monitoring, employee security (hiring / offboarding / training), physical security (usually "N/A  -  remote, hosted on {cloud}"), compliance certifications (SOC 2, ISO, HIPAA, GDPR), AI / model training, customer support data access, data retention + deletion.

## Steps
<!-- houston-workflow:v1 -->

1. **Read shared context**: `context/legal-context.md`. If missing/empty, ask user in plain language: "I need a few basics about your company first to answer this well. Want to set those up now?" Then run `set-up-my-legal-info` if yes. Stop until that's done. Extract entity name, data geography, standing enterprise customer agreements that might constrain answers.
2. **Read answers library**: `config/security-answers.md`. If missing, first questionnaire  -  fine, library seeds from answers captured here. Note in output how many prior answers on hand.
3. **Locate questionnaire.** Accept: (a) pasted text, (b) file path (PDF, DOCX, XLSX, CSV), (c) URL or pointer into connected document storage, (d) Google Sheets / Airtable link. If document storage or sheet tool connected, discover via any Composio-connected document-storage or spreadsheet category, fetch. If none provided, ask ONE question: "Paste questionnaire, upload file, or point me to it in your document storage."
4. **Parse.** Extract question set into structured array: `{ id, section, question, expectedFormat? }`. `id` = stable hash of `section + question text` so re-runs don't renumber. `expectedFormat` captures answer shape if evident ("Yes/No", "Free text", "Yes/No + comment", "Document attachment"). Parsing fails (scanned PDF, locked PDF, image-only) → tell user, ask for text-extractable version. Don't guess.
5. **Auto-fill from answers library.** For each question, match against `config/security-answers.md`:
   - **Exact match**  -  prior Q/A with ≥ 90% token overlap, same topic → pre-fill, mark source `"library-exact"`.
   - **Near match**  -  prior Q/A same topic, semantically equivalent → pre-fill, mark `"library-near"`, flag for founder spot-check.
   - **No match**  -  leave blank, mark `"needs-founder"`.
6. **Group unanswered by topic.** Use topic bucket list above. Goal: one sit-down answers as many `needs-founder` as possible. Within topic, simpler Yes/No first → quick wins.
7. **Draft response doc.** Write to `security-questionnaires/{counterparty-slug}-{YYYY-MM-DD}.md` atomically (`*.tmp` → rename). Structure:
   - Header: counterparty, questionnaire type (SIG-lite / CAIQ / custom / etc.), total question count, pre-filled count, needs-founder count, near-matches needing spot-check.
   - **Pre-filled answers**  -  grouped by topic, each shows Q, A, source tag (`library-exact` / `library-near`). Near-matches get one-line "verify this still holds" prompt.
   - **Still need from you**  -  grouped by topic, numbered for easy chat answering. Include suggested answer shape (Yes/No, short paragraph, attach policy doc).
   - Footer: "This is a summary, not legal advice. Some answers in security questionnaires create real contractual commitments. If anything has serious commercial impact, ask me to prepare a brief for outside counsel."
8. **Write short list.** Also produce short (≤ 10 item) "needs-you-now" list  -  minimal set unblocking draft-back. Inline at top of response doc + in user summary.
9. **Capture new answers as founder responds.** After founder answers in chat, append/update `config/security-answers.md` atomically:
   - New topic + Q/A → append under topic header.
   - Existing Q/A founder updated → replace A, note `(updated {YYYY-MM-DD})` inline.
   - Never drop prior answers without founder's explicit OK.
   Refresh response doc with newly-captured answers, re-classify as `library-exact` going forward.
10. **Append to `outputs.json`**  -  read existing array, add `{ id, type: "security-questionnaire", title, summary, path, status: "draft", createdAt, updatedAt, attorneyReviewRequired }`. Set `attorneyReviewRequired: true` if the questionnaire contains any question implying contractual commitment (breach notification SLAs, uptime SLAs, data residency commitments, audit rights, indemnities, insurance minimums)  -  these shouldn't be answered without outside-counsel review.
11. **Summarize to user.** Plain language. One short paragraph: "{Counterparty}'s questionnaire has {total} questions. I filled in {N} from what I already know about your company ({M} need a quick spot-check). {K} questions need you. Want to knock out the {topic} section first?" Never name files or paths.

## Never invent

- Never fabricate security control founder hasn't confirmed. "No" or "Not yet" right answer until founder implements  -  fake "Yes" = how founders breach contracts they didn't realize they signed.
- Never normalize sensitive answers. Founder says "Postgres on RDS, encrypted" → answer doc says "Postgres on RDS, encrypted"  -  not "industry-standard managed database with encryption-at-rest." Specificity matters for enterprise buyers + later audits.
- Never hedge with "probably" or "likely." State answer or mark `needs-founder`.

## Hard nos

- Never sends, shares, returns questionnaire to counterparty. Every draft for founder review + send.
- Never provides legal advice not clearly marked summary. Footer line non-negotiable.
- Never commits founder to timeline, SLA, uptime figure, insurance coverage, certification status without founder's explicit confirmation.
- Never hardcodes tool names. Questionnaire fetches flow through any Composio-connected document-storage or spreadsheet category.
- Never hardcodes topic bucket list as exhaustive  -  novel topic in questionnaire → add to grouping, note in output so library grows.

## Outputs

- `security-questionnaires/{counterparty-slug}-{YYYY-MM-DD}.md`  -  draft response + needs-you list.
- Appends / updates `config/security-answers.md`  -  persistent answers library.
- Appends to `outputs.json` with type `security-questionnaire`.