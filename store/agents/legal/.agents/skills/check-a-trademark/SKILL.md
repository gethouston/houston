---
name: check-a-trademark
description: "Quickly check if a name is free to use as a trademark. I search the official US trademark database for exact, sound-alike, and look-alike hits, then rate the risk Low / Medium / High and tell you what to do next. Heads up: this is a quick check, not a full legal clearance — for that you need a real trademark lawyer."
version: 1
category: IP
featured: no
image: scroll
integrations: [firecrawl]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Check a Trademark

Not clearance opinion  -  knockout. Knockout answer "obvious blocker?" Not "safe to register?" Second question need TM counsel.

## When to use

- "Run knockout on {mark}."
- "Is {name} available as trademark?"
- Before any spend on branding, domain, logomark.
- Before filing 1(b) intent-to-use application.

## Steps
<!-- houston-workflow:v1 -->

1. **Read shared context.** Read `context/legal-context.md`. If missing or empty, ask the user in plain language: "I need to know a few basics about your company first. Want to set those up now?" Then run `set-up-my-legal-info` if yes. Stop until that's done.

2. **Confirm mark + classes.** Founder give:
   - Proposed **word mark** (design element / logo separate if relevant  -  design marks need own search).
   - **Nice classes** they want. Most SaaS founders = **Class 9** (software / downloadable apps) + **Class 42** (SaaS / platform-as-a-service). Branded consumer hardware add **Class 35** (retail services) or product class. Founder unsure → propose 9 + 42, confirm.

   Write `config/trademark-prefs.json` with `{ classes, lastSearchedAt }` if first-time.

3. **Run knockout vs USPTO Trademark Center.** Run `composio search uspto` or `composio search trademark` for tool slug; USPTO Trademark Center (launched Jan 2025) = canonical system. No connected tool → run `composio search web-scrape` and query `https://tmsearch.uspto.gov/` direct.

   Four passes per class:

   - **Exact-word pass**  -  `mark` as wordmark.
   - **Phonetic pass**  -  phonetic equivalents (Kandi vs Candy, Fone vs Phone, Noot vs Newt, etc.).
   - **Visual pass**  -  letter-swap / transliteration (Lyft vs Lift, Tumblr vs Tumbler).
   - **Root-word pass**  -  search root if mark compound (e.g. "BrightCloud" → search "Bright" and "Cloud").

4. **Classify each hit.** Per result capture: serial number, full mark, owner, goods/services description, class, filing date, status (`LIVE` / `PENDING` / `ABANDONED` / `DEAD`). LIVE or PENDING hit in overlapping class = blocker. ABANDONED or DEAD = informational (still possible common-law mark issue, not registration blocker).

5. **Assess risk.**
   - **High**  -  exact or phonetic LIVE/PENDING hit, same class. Or LIVE/PENDING hit with near-identical goods description.
   - **Medium**  -  exact LIVE/PENDING hit in adjacent class (e.g. want Class 42 SaaS; Class 9 software hit exists). Or phonetic/visual LIVE/PENDING hit, same class. Or many ABANDONED hits = crowded field.
   - **Low**  -  no LIVE/PENDING hits in target or adjacent classes; few ABANDONED/DEAD hits, or wholly different goods.

6. **Recommend next step.**
   - Low → file **1(b) intent-to-use** once mark locked, or keep using and file 1(a) once in commerce. USPTO fee ~$350/class on TEAS Plus.
   - Medium → **retain TM counsel for full clearance** before filing; coexistence strategies possible.
   - High → **rebrand**, or retain TM counsel for coexistence / consent agreements. No file.

7. **Write atomically** to `tm-searches/{mark-slug}-{YYYY-MM-DD}.md` with:
   - Mark + classes searched + search timestamp.
   - Risk assessment + one-line rationale.
   - Hit table (exact pass, phonetic pass, visual pass, root pass) with serial number, mark, owner, class, status.
   - Recommended next step.
   - **Limits disclosure**  -  verbatim: "This is a knockout search, not a full clearance. It covers USPTO federal registrations only. It does not cover state registrations, common-law marks, foreign marks, or domain/social-handle availability. For High-risk results or pre-filing, retain TM counsel."

8. **Append to `outputs.json`**  -  `{ id, type: "tm-search", title, summary, path, status: "ready", createdAt, updatedAt, attorneyReviewRequired }`. Flip `attorneyReviewRequired: true` on any **High** risk (always) and any **Medium** risk founder intend to proceed with.

9. **Summarize to user.** Plain language. State the risk (Low / Medium / High), the single biggest hit (who owns it, what they sell), and the next move ("file when you're ready" / "talk to a trademark lawyer first" / "rebrand"). Never name files or paths.

## Outputs

- `tm-searches/{mark-slug}-{YYYY-MM-DD}.md`
- Appends to `outputs.json` with `type: "tm-search"`.