---
name: audit-compliance
description: "Check that your legal compliance is still in good shape. Pick what to check: your privacy policy, your privacy vendor list, or your contract templates. I surface what's drifted or out of date and what to fix. I never change anything on my own."
version: 1
category: Compliance
featured: yes
image: scroll
integrations: [googledocs, googledrive, stripe, firecrawl]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Audit Compliance

One skill for all standing-state compliance checks. `scope` param picks inventory to walk. "Diffs not fixes" + "every finding cite authority" discipline shared.

## Parameter: `scope`

- `privacy-posture`  -  scrape landing + product via Firecrawl, cross-check deployed Privacy Policy, flag drift (new analytics tool undisclosed, subprocessor added no policy update, new cookie, purpose drift) with severity + recommended update. Writes `privacy-audits/{YYYY-MM-DD}.md`.
- `subprocessors`  -  walk connected integrations + inferred vendors from landing-page scrape, capture role + data categories + transfer mechanism + DPA status + public DPA URL. Read-merge-write `subprocessor-inventory.json` at agent root + one-page delta report at `subprocessor-reviews/{YYYY-MM-DD}.md`.
- `template-library`  -  read `domains.contracts.templateLibrary`, flag templates > 12 months old, check each vs current law refs (AI-training disclosure, SCC versions, 2026 DPA standards, CA/EU rights expansions). Writes refresh plan `template-reviews/{YYYY-MM-DD}.md`. Never auto-rewrites  -  founder approves each, kicks `draft-a-legal-document` for rewrite.

User name scope plain English ("audit my privacy", "refresh templates", "update subprocessor list") → infer. Ambiguous → ask ONE question naming 3 options.

## When to use

- Explicit: "audit my privacy posture", "update my subprocessor list", "refresh my template library", "what's drifted", "what's stale".
- Plain-English asks map to a `scope`: "is my privacy policy still current" / "does my privacy policy match what we actually do" → `privacy-posture`; "refresh my privacy vendor list" / "have we added new tools that touch customer data" → `subprocessors`; "are my contract templates still current" / "any template older than a year I should refresh" → `template-library`.
- Implicit: scheduled monthly cadence (privacy-posture, subprocessors); new vendor added (subprocessors); new landing-page surface ships (privacy-posture); template library referenced older than 12 months in any other skill (template-library).

## Ledger fields I read

Read `config/context-ledger.json` first.

- `universal.legalContext` + `context/legal-context.md`  -  required. Provides entity snapshot, risk posture, existing template stack (anchor for template-library scope). Missing → run `set-up-my-legal-info` skill first (or ask ONE targeted question to skip ahead).
- `universal.company.website`  -  required for `privacy-posture` + `subprocessors` (landing-page URL for Firecrawl).
- `domains.compliance.landingPageUrl`  -  more specific than `universal.company.website` if differ; falls back to website.
- `domains.compliance.deployedPolicies.privacyPolicyUrl`  -  required for `privacy-posture` (doc to diff against).
- `domains.compliance.dataGeography`  -  gates whether EU-specific subprocessor controls (SCCs, transfer mechanism) apply.
- `domains.contracts.templateLibrary`  -  required for `template-library`.
- `subprocessor-inventory.json`  -  required for `subprocessors` (prior inventory = baseline for delta).

Required field missing → ask ONE targeted question with modality hint (connect Google Drive / paste landing URL / connect Firecrawl), write, continue.

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + legal context.** Gather missing required fields. Write atomically.
2. **Discover tools via Composio.** Run `composio search web-scrape` (privacy-posture, subprocessors) or `composio search document-storage` (template-library) per scope. No tool connected → name category to link, stop.
3. **Branch on `scope`.**
   - `privacy-posture`:
     1. Execute web-scrape slug against landing-page URL + key product routes. Capture analytics tags, cookies dropped, forms + fields, third-party embeds, subprocessor-revealing scripts (Stripe, Intercom, Segment, HotJar, etc.).
     2. Fetch deployed Privacy Policy (via URL from ledger or same scrape).
     3. Diff: tools observed on site not in policy, data categories collected not disclosed, new cookie categories, purpose drift (product description changed meaningfully since last policy update).
     4. Tag each finding severity (`critical`  -  regulatory exposure; `high`  -  customer trust risk; `medium`  -  housekeeping; `low`  -  FYI). Cite authority for every `critical` finding (GDPR Art. 13/14, CCPA §1798.100, 16 CFR Part 314 where applicable).
     5. Write `privacy-audits/{YYYY-MM-DD}.md`: Executive summary → Diffs by severity → Recommended next step per finding (most often: chain to `draft-a-legal-document` type=privacy-policy).
   - `subprocessors`:
     1. Read current `subprocessor-inventory.json`.
     2. Walk connected integrations (via user's installed Composio connections)  -  each connected tool touching customer data = candidate subprocessor.
     3. Scrape landing page for extra clues (Stripe, Intercom, Calendly, etc. via public scripts).
     4. Per candidate capture: `role` (payment / email / analytics / support / hosting / AI / CRM / other), `dataCategories` (identifiers / usage / content / payment / sensitive), `transferMechanism` (SCCs / UK IDTA / DPF / intra-EU / intra-US-only / unknown), `dpaStatus` (signed standard / signed negotiated / public-posted / missing / unknown), `publicDpaUrl`.
     5. Read-merge-write `subprocessor-inventory.json`. Delta vs prior = added / removed / changed / unchanged.
     6. Write `subprocessor-reviews/{YYYY-MM-DD}.md`  -  one-page delta, "new vendors needing policy update" at top + link to `audit-compliance` scope=privacy-posture as follow-up.
   - `template-library`:
     1. Read `domains.contracts.templateLibrary`. Per template, check `lastUpdatedAt` (or file metadata); flag anything > 12 months.
     2. Per stale template, enumerate current-law changes to consider (AI-training disclosure for consulting / MSA / customer paper; SCC 2021 / 2025 version check for DPAs; 2026 DPA standards; CCPA cure-period language; EU AI Act disclosures for AI-touching features).
     3. Rank by exposure (customer paper > vendor paper > internal).
     4. Write `template-reviews/{YYYY-MM-DD}.md`  -  refresh plan: (a) templates to refresh now, (b) review next quarter, (c) still current. Never auto-rewrites; recommends chaining `draft-a-legal-document` per template.
4. **Append to `outputs.json`**  -  read-merge-write atomically: `{ id, type: "privacy-audit" | "subprocessor-review" | "template-review", title, summary, path, status: "ready", domain: "compliance", createdAt, updatedAt, attorneyReviewRequired? }`. Set `attorneyReviewRequired: true` when `critical` finding implicates regulatory exposure.
5. **Summarize to user.** One short paragraph in plain language: top 2 findings and the single most useful next move (e.g. "Want me to draft an updated privacy policy that closes these gaps?"). Never name files, paths, or underlying procedures.

## What I never do

- Auto-fix anything. Skill surfaces diffs + recommends follow-ups; founder decides.
- Invent subprocessor, data flow, or cookie not observed in scrape or connected integration. Missing data → UNKNOWN.
- Claim policy GDPR-compliant. Can say "policy discloses X, does not disclose Y"  -  never "you're covered."
- Hardcode tool names  -  Composio discovery at runtime only.
- Overwrite `subprocessor-inventory.json`  -  read-merge-write.
- Skip authority citation on any `critical` privacy-posture finding.

## Outputs

- `privacy-audits/{YYYY-MM-DD}.md` (scope=privacy-posture).
- `subprocessor-reviews/{YYYY-MM-DD}.md` + updates `subprocessor-inventory.json` (scope=subprocessors).
- `template-reviews/{YYYY-MM-DD}.md` (scope=template-library).
- Appends to `outputs.json`.