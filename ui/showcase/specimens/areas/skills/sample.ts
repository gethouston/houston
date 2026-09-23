import type { SkillWorkflowStepItem } from "@houston-ai/skills";

/**
 * The Skills area's shared fixture: the procedure a Houston-written skill
 * parses into. Real Houston content — an agent's actual procedures — so every
 * page on this area reviews the component against the copy lengths the product
 * produces.
 *
 * Exports no `specimen` and no `sources`: this is a helper module, pulled in by
 * the pages beside it.
 */

/**
 * A skill Houston wrote, as the domain parser reads it out of SKILL.md: steps
 * an owner checks, some of them acting on a connected app.
 */
export const houstonWorkflowSteps: SkillWorkflowStepItem[] = [
  {
    title: "Read the inputs",
    detail:
      "The period to close, in YYYY-MM.\n• The chart of accounts, locked for the run.\n• Last month's closing balances.",
    integration: null,
  },
  {
    title: "Reconcile every account",
    detail:
      "One pass per bank account. Stop and ask before plugging a difference over $100.",
    integration: { toolkit: "googlesheets", action: "GOOGLESHEETS_GET_ROWS" },
  },
  {
    title: "Draft each pending journal entry",
    detail:
      "Reversals first, then accruals, prepaids, payroll, revenue recognition and depreciation. Everything stays a draft.",
    integration: { toolkit: "quickbooks", action: null },
  },
  {
    title: "Assemble the close package",
    detail: null,
    integration: {
      toolkit: "googledrive",
      action: "GOOGLEDRIVE_CREATE_FOLDER",
    },
  },
  {
    title: "Summarize for the founder",
    detail: "Net income, closing cash, and the four things still open.",
    integration: { toolkit: "gmail", action: "GMAIL_SEND_EMAIL" },
  },
];
