---
name: prepare-the-delaware-annual-filing
description: "Get ready for your Delaware annual report and franchise tax (due March 1 every year). I run the math two ways and pick the cheaper one, which is usually 10x to 100x lower than the scary number Delaware shows by default. You get a step-by-step pack of exactly what to enter on the state's website. You file, I prep."
version: 1
category: Entity
featured: no
image: scroll
integrations: [googledocs]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Prepare the Delaware Annual Filing

Every Delaware C-corp owe franchise-tax filing + annual report by
**March 1**. Default online calc use Authorized-Shares, quote scary
number  -  often $75K+ for standard 10M-authorized-share startup. The
**Assumed-Par-Value-Capital method** almost always produce much
lower tax (often $400-$1,000 small startup). Run both, flag savings.

## When to use

- "Prep my Delaware annual report for {year}."
- "Delaware franchise tax is coming up."
- Triggered by `track-deadlines-and-signatures` (scope=deadlines) when March 1 deadline
  enter 90-day window.
- Founder got scary invoice from Delaware, want recalc.

## Steps
<!-- houston-workflow:v1 -->

1. **Read shared context.** Read `context/legal-context.md`.
   If missing or empty, ask the user in plain language: "I need a few basics about your company first (state of formation, authorized shares, directors). Want to set those up now?" Then run `set-up-my-legal-info` if they say yes. Stop until that's done.

2. **Read config.** `config/entity.json`  -  confirm
   `stateOfIncorporation === "DE"`. If not, respond: "This only
   applies to Delaware entities; your entity is registered in
   {state}." Stop.

3. **Gather filing inputs.** Read from `legal-context.md`:
   - Entity legal name
   - File number (Delaware state file number, 7 digits)
   - Authorized shares (per share class: common + any preferred)
   - Par value per share (typically $0.0001 or $0.00001 for
     startups)
   - Registered agent name + address
   - Formation date

   More inputs for recalc (ask founder if missing, one at time):
   - **Issued shares as of fiscal year-end** (per class). Pull
     from `composio search cap-table` (Carta / Pulley); if not
     connected, ask.
   - **Gross assets as of fiscal year-end** (from balance sheet  -
     total assets line). If pre-revenue with <$50K in bank, usually
     just "cash on hand".
   - **Directors**  -  name + title each board member.
   - **Officers**  -  name + title each (President, Secretary,
     Treasurer minimum; sole-founder typically hold all three).
   - **Principal place of business**  -  address (founder home office
     or registered-agent address OK).

4. **Run both franchise-tax calculations.**

   **Method A  -  Authorized-Shares (default, usually higher):**
   - ≤ 5,000 shares: $175 flat (minimum).
   - 5,001-10,000 shares: $250 flat.
   - > 10,000 shares: $250 + $85 per additional 10,000 shares (or
     fraction), capped at $200,000.
   - 10M-authorized-share startup → ~$85,165 under this method.

   **Method B  -  Assumed-Par-Value-Capital:**
   1. `assumedParValueCapital = (grossAssets / totalIssuedShares)
      * totalAuthorizedShares`.
   2. Tax = `$400 per $1,000,000 of assumedParValueCapital`
      (minimum $400; maximum $200,000).
   3. 10M-authorized, 8M-issued, $100K-gross-assets startup →
      `(100000 / 8000000) * 10000000 = $125,000` assumed par value
      → tax $400 (hit floor).

   Pick **lower** of A and B. Delaware statute explicitly allow
   Assumed-Par-Value-Capital election. Cite **8 Del. C. §503**.

5. **Show both numbers + savings.** Example call-out:
   > "Default Authorized-Shares method: $85,165.
   > Assumed-Par-Value-Capital method: $400.
   > Savings: $84,765. Elect Assumed-Par-Value-Capital on the
   > filing form  -  there's a radio button on the Delaware portal
   > for this."

6. **Assemble submission package.** Write single markdown file to
   `annual-filings/de-{year}.md` with:

   - **Summary**  -  entity, year, total due (lower of methods A/B),
     election being made, deadline (March 1, {year}).
   - **Calculation detail**  -  both methods, inputs, result.
   - **Annual report content**  -  entity name, file number,
     principal place of business, phone, directors (name + addr),
     officers (name + addr + title), issued shares.
   - **Step-by-step portal guide**  -  URL
     (https://corp.delaware.gov/paytaxes/), log in with entity
     file number, select annual report + franchise tax, enter
     officers + directors, **select "Assumed Par Value" on
     franchise-tax election radio**, enter gross assets + issued
     shares, pay.
   - **Late-fee warning**  -  $200 late fee + 1.5% monthly interest;
     failure two consecutive years → entity declared void.
   - **Reminders**  -  registered-agent renewal (separate bill from
     agent), annual board consent (separate process).

7. **Write atomically** (`*.tmp` → rename).

8. **Append to `outputs.json`**  -  `{ id, type: "annual-filing",
   title, summary, path, status: "draft", createdAt, updatedAt,
   attorneyReviewRequired }`. Flip `attorneyReviewRequired: true`
   if cap table has anything unusual  -  unconverted SAFEs /
   convertibles, multiple preferred classes, shares issued at
   non-standard par, founder stock not yet issued on ledger, or
   any discrepancy between cap table and board-consented issuances.

9. **Mark calendar row done** once founder confirms filed. Update
   `deadline-calendar.json` `type: "delaware-franchise-tax"` row →
   `status: "done"`; next year row seed on January 1.

10. **Summarize to user.** Plain language. Show both tax numbers, the savings, the March 1 deadline, the link to the Delaware filing site, and a one-liner: "I've laid out exactly what to enter. Go to that page when you're ready and follow the steps." Never name files or paths.

## Outputs

- `annual-filings/de-{YYYY}.md`
- Appends to `outputs.json` with `type: "annual-filing"`.