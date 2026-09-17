---
name: vet-a-vendor
description: "Run due-diligence on a vendor before you sign. Pick what you need: a fit evaluation that scores them 1-10 against your rubric with risk tier and recommendation, or a compliance check that verifies their frameworks, names their security leadership, and surfaces public incidents. Every claim cited."
version: 1
category: Operations
featured: no
image: clipboard
integrations: [linkedin, firecrawl, perplexityai]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Vet A Vendor

One skill for vendor due-diligence. `aspect` param picks the angle: a commercial-fit evaluation against your supplier rubric, or a public-source compliance research report. Both ground in your operating context so risk thresholds match your posture.

## Parameter: `aspect`

- `fit`  -  rubric-based commercial due-diligence. Scores supplier 1-10 against your rubric, assigns risk tier (green / yellow / red), surfaces strengths, concerns, first-call questions, and a recommendation. Output: `evaluations/{supplier-slug}.md`.
- `compliance`  -  public-source compliance research. Catalogs frameworks claimed, triangulates against independent verification, names security leadership, lists incidents from the last 3 years. Every claim cited. Output: `compliance-reports/{company-slug}.md`.

User names aspect in plain English ("evaluate Stripe", "is Vercel a fit", "compliance check on Mongo", "is Notion clean") -> infer. Ambiguous -> ask ONE question naming both options.

## When to use

**fit:**
- "evaluate {supplier} for {product / service}"
- "score these suppliers against our criteria"
- "is {vendor} a fit for {our use case}"
- Called from `score-an-inbound` when inbound is a supplier application.

**compliance:**
- "run compliance due-diligence on {vendor}"
- "is {company}'s compliance posture real"
- "what frameworks does {vendor} actually hold"
- Called as sub-step of `aspect=fit` for risk-sensitive suppliers (data processors, infra, financial services).

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing -> I name the category, ask you to connect it from the Integrations tab, stop.

- **Web research** (Firecrawl, Exa, Perplexity)  -  Required (both aspects). For `fit`: pulls supplier site, pricing, case studies, recent news. For `compliance`: pulls trust pages, security pages, news coverage, triangulates framework claims.
- **Inbox** (Gmail, Outlook)  -  Optional for `fit`. Surfaces prior correspondence so I don't start cold. Not used for `compliance`.
- **Social / professional network** (LinkedIn)  -  Optional for `compliance`. Lets me confirm a named CCO / CISO is real and active. Not used for `fit`.

If no web research provider is connected I stop and ask you to connect a research provider first.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Vendor posture**  -  Required (both aspects). Why I need it: shapes how strict I am with risk flags (`fit`) and what counts as a material red flag (`compliance`). If missing I ask: "How do you approach vendors  -  conservative, balanced, or move fast?"
- **What you're evaluating them for**  -  Required for `fit`. Why I need it: a payments processor and a design agency rate on different things. If missing I ask: "What are you considering this supplier for, and what would success look like in 6 months?"
- **Supplier rubric**  -  Optional for `fit`. Why I need it: lets me score against your criteria, not a generic one. If you don't have it I keep going with the default rubric and name it in the output.
- **Active priorities**  -  Required for `fit`. Why I need it: drives the fit-to-priorities score. If missing I ask: "What are the 2 to 3 things the company is pushing on this quarter?"
- **Company to investigate**  -  Required for `compliance`. Why I need it: skill targets one company at a time. If missing I ask: "Which company should I run the compliance check on?"
- **Hard nos**  -  Optional for `compliance`. Why I need it: lets me weight specific frameworks (HIPAA, PCI, SOC2) higher when they matter to you. If you don't have it I keep going with TBD and surface every gap I find.

## Steps
<!-- houston-workflow:v1 -->

### Shared steps (both aspects)

1. **Read `context/operations-context.md`.** Vendor posture, hard nos, active priorities anchor severity thresholds. If missing: stop, ask user run `set-up-my-ops-info` first.

### Branch on `aspect`:

#### `fit`

2. **Read `config/supplier-rubric.md`.** If missing, use default defined in `data-schema.md` (fit / quality-signals / reference-quality / risk-signals / friction-to-start).

3. **Read `config/procurement.json`**  -  risk appetite + signature authority anchor severity thresholds.

4. **Gather evidence.**
   - **Supplier's own surface**  -  `composio search web-scrape` -> pull website, pricing page, docs, case studies.
   - **Public profile**  -  founders, size/stage, notable customers, recent news. Use `composio search research` or `web-search`.
   - **Prior correspondence**  -  `composio search inbox` -> search supplier name or domain in founder's inbox.
   - **References you can triangulate**  -  public case studies with identifiable names; flag if any in Key Contacts of operating context.
   - **Compliance quick-check**  -  run this skill with `aspect=compliance` as sub-step for any risk-sensitive supplier (data processors, infrastructure, financial services vendors).
   - **Pricing signal**  -  what's discoverable. If behind sales gate, note it.

5. **Score against rubric.** Per criterion:
   - Rating 1-5 (or scale rubric specifies).
   - 1-2 lines evidence with source URLs.
   - Explicit `INSUFFICIENT-EVIDENCE` marker if data not there  -  never guess.

   Compute overall score (weighted sum per rubric) out of 10.

6. **Assign risk tier.**
   - **Green**  -  overall >= 8 AND no red flags on risk-signals criterion.
   - **Yellow**  -  overall 6-7.9 OR one material concern.
   - **Red**  -  overall < 6 OR any hard-no violation (data handling, compliance incident, obvious misrepresentation).

7. **Produce output** (save to `evaluations/{supplier-slug}.md`):
   - **Summary**  -  2 sentences: who they are + what they do.
   - **Rubric + scoring table**  -  criterion | rating | evidence (with URLs).
   - **Strengths**  -  3 bullets, most-compelling first.
   - **Concerns**  -  3 bullets, most-material first.
   - **Risk tier**  -  with 1-line reason.
   - **Questions for first call**  -  5-8 tight questions that close evidence gaps and/or expose hidden risk.
   - **Recommendation**  -  `Proceed` / `Pass` / `Get more info` with 3-line rationale.
   - **Founder decision**  -  blank; founder fills in.

8. **Atomic writes**  -  `*.tmp` -> rename.

9. **Append to `outputs.json`** with `type: "supplier-evaluation"`, status "draft" (only founder marks `ready` after deciding).

10. **Summarize to user**  -  tier + overall score + #1 thing founder should resolve before deciding.

#### `compliance`

2. **Gather public signals.**
   - **Frameworks claimed on their surface**  -  `composio search web-scrape` -> pull trust page, security page, privacy page. Catalog claims (SOC2 Type II, ISO 27001, HIPAA, GDPR, PCI-DSS, etc.).
   - **Independent verification**  -  for each claim, triangulate: does trust-center provider (TrustArc, Vanta, Drata) confirm? Does press release name a specific auditor? Report ID or Trust portal exist? Use `composio search research` with specific queries.
   - **Named CCO / CISO / Head-of-Security**  -  identify person, link LinkedIn if findable (`composio search social` or `web-search`).
   - **Public incidents last 3 years**  -  breaches, SEC disclosures, class actions, regulatory actions (FTC, ICO, state AGs). Use `composio search news` + `web-search` with pointed queries.
   - **Legal / regulatory posture**  -  open litigation naming company as defendant? SEC filings if public?

3. **Check gaps between claim and evidence.**
   - Claim SOC2 but no independent confirmation anywhere -> flag.
   - Named officer but no LinkedIn / no public presence -> flag.
   - Silence on framework their category usually requires (e.g. healthcare SaaS with no HIPAA mention) -> flag.

4. **Produce output** (save to `compliance-reports/{company-slug}.md`):
   - **Summary**  -  1 paragraph: who they are + compliance posture in one line.
   - **Frameworks claimed**  -  table: framework | claim source | independent verification (Y/N with URL) | notes.
   - **Named security leadership**  -  name, title, LinkedIn, tenure if findable.
   - **Public incidents (last 3 years)**  -  chronological list, each with source URL + 1-line description.
   - **Gaps between claim and evidence**  -  bullet list, most material first.
   - **Recommendation-shaped summary**  -  NOT legal opinion: "on public surface reads as {strong / adequate / thin / concerning}" with 2-3 specific things to verify before signing.
   - **Every claim cites source URL.** No uncited assertions.

5. **Atomic writes**  -  `*.tmp` -> rename.

6. **Append to `outputs.json`** with `type: "compliance-report"`, status "ready".

7. **Summarize to user**  -  recommendation-shaped summary + #1 gap founder should close before signing.

## What I never do

- **Contact supplier or vendor.** First-call questions are for the founder. Drafting outreach is a separate skill (`draft-a-message type=vendor`).
- **Commit to decision.** I recommend; founder decides.
- **Score without rubric.** If no rubric exists and founder doesn't provide one, use default and name it in output.
- **Render legal opinion.** "Looks adequate on public surface" is as strong as I go. Legal review = founder's lawyer's job.
- **Treat trust-page claim as proof.** Every framework claim needs at least one independent signal, else flagged.
- **Retrieve non-public data.** If behind login, trust portal with NDA, or specific request, note as "request from vendor" rather than extract.

## Outputs

- `evaluations/{supplier-slug}.md` (aspect=fit) -> appends to `outputs.json` with `type: "supplier-evaluation"`, status "draft".
- `compliance-reports/{company-slug}.md` (aspect=compliance) -> appends to `outputs.json` with `type: "compliance-report"`, status "ready".
