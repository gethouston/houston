/**
 * The table itself: every product beat the client may send, what each one
 * means, and the only properties that ride it.
 *
 * Keyed by `AnalyticsEventName` on purpose: a name that is not a real tracked
 * event, or a property key that is not a real tracked property, fails the
 * build rather than going quiet in production.
 */

import type {
  AnalyticsEventName,
  AnalyticsProperty,
} from "../analytics-vocabulary.ts";

export interface ProductEventSpec {
  /** One sentence: what this event means, for whoever reads the table. */
  readonly definition: string;
  /** The only property keys that ride this event. Everything else is dropped. */
  readonly props: readonly AnalyticsProperty[];
}

const CATALOGUE = {
  session_started: {
    definition:
      "The app launched (or reloaded) and reached a signed-in hosted session.",
    props: [],
  },
  // First run, in funnel order: the flow starting, each screen it reached,
  // the gate it had to clear, then the three survey questions (asked at first
  // run or later from the profile-completion prompt — `source_screen` says
  // which) with the answer each one confirmed.
  onboarding_started: {
    definition: "The first-run onboarding flow started.",
    props: ["source"],
  },
  onboarding_step_viewed: {
    definition: "An onboarding step was reached, once per step per run.",
    props: ["step"],
  },
  onboarding_agreement_accepted: {
    definition: "The terms/disclaimer gate was accepted.",
    props: [],
  },
  onboarding_segment_screen_viewed: {
    definition: "The first-run survey's segment question was shown.",
    props: ["source_screen"],
  },
  onboarding_segment_continued: {
    definition: "The user confirmed their segment answer.",
    props: ["selected_segment", "source_screen"],
  },
  onboarding_industry_screen_viewed: {
    definition: "The survey's industry question was shown.",
    props: ["source_screen"],
  },
  onboarding_industry_continued: {
    definition: "The user confirmed their industry answer.",
    props: ["selected_industry", "source_screen"],
  },
  onboarding_goal_screen_viewed: {
    definition: "The survey's goal question was shown.",
    props: ["source_screen"],
  },
  onboarding_goal_continued: {
    definition:
      "The user submitted the automation-goal step (the text never leaves the device).",
    props: ["goal_provided", "source_screen"],
  },
  onboarding_completed: {
    definition: "The first-run onboarding flow finished.",
    props: [],
  },
  ai_provider_connected: {
    definition: "An AI provider was connected during onboarding.",
    props: ["provider"],
  },
  agent_created: {
    definition: "A new agent was created from scratch.",
    props: ["source"],
  },
  agent_installed_from_store: {
    definition: "An agent was installed from the Agent Store.",
    props: ["agent_slug", "source"],
  },
  agent_shared: {
    definition: "The user shared or exported an agent.",
    props: ["source"],
  },
  integration_connected: {
    definition: "A tool integration finished connecting.",
    props: ["integration_slug", "integration_kind"],
  },
  skill_installed: {
    definition: "A skill landed in an agent.",
    props: ["skill_slug", "source"],
  },
  skill_used: {
    definition: "A skill was invoked from the chat.",
    props: ["skill_slug"],
  },
  file_attached: {
    definition: "A file was attached to a message.",
    props: ["file_kind"],
  },
  dictation_used: {
    definition: "A dictation produced a transcript the user kept.",
    props: [],
  },
  search_performed: {
    definition: "A search session started (once per empty to non-empty query).",
    props: ["surface"],
  },
  command_palette_opened: {
    definition: "The command palette was opened.",
    props: [],
  },
  tab_opened: {
    definition: "A top-level tab or screen was opened.",
    props: ["tab_name"],
  },
  academy_lesson_completed: {
    definition: "An Academy lesson was completed.",
    props: ["lesson", "chapter"],
  },
  app_error_shown: {
    definition: "An unexpected error reached the reporting path.",
    props: ["error_kind"],
  },
  session_failed: {
    definition: "An agent turn failed.",
    props: ["error_kind", "agent_slug"],
  },
} satisfies Partial<Record<AnalyticsEventName, ProductEventSpec>>;

export type ProductEventName = keyof typeof CATALOGUE;

/** The one table. */
export const PRODUCT_EVENTS: Readonly<
  Record<ProductEventName, ProductEventSpec>
> = CATALOGUE;
