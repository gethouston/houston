import type {
  AnalyticsEventName,
  AnalyticsProperty,
} from "../analytics-vocabulary.ts";

export interface ProductEventSpec {
  readonly definition: string;
  readonly props: readonly AnalyticsProperty[];
}

const CATALOGUE = {
  session_started: {
    definition:
      "The app launched (or reloaded) and reached a signed-in hosted session.",
    props: [],
  },
  onboarding_started: {
    definition: "The first-run onboarding flow started.",
    props: ["source"],
  },
  onboarding_step_viewed: {
    definition: "An onboarding step was reached, once per step per run.",
    props: ["step"],
  },
  onboarding_industry_screen_viewed: {
    definition: "The survey's industry question was shown.",
    props: ["source_screen"],
  },
  onboarding_industry_continued: {
    definition: "The user confirmed their industry answer.",
    props: ["selected_industry", "source_screen"],
  },
  onboarding_role_screen_viewed: {
    definition: "The survey's role question was shown.",
    props: ["source_screen"],
  },
  onboarding_role_continued: {
    definition: "The user confirmed their role answer.",
    props: ["selected_role", "source_screen"],
  },
  onboarding_company_size_screen_viewed: {
    definition: "The survey's company-size question was shown.",
    props: ["source_screen"],
  },
  onboarding_company_size_continued: {
    definition: "The user confirmed how big their company is.",
    props: ["selected_company_size", "source_screen"],
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
  onboarding_goal_handoff: {
    definition: "The user's onboarding goal was sent to the AI Manager.",
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

export const PRODUCT_EVENTS: Readonly<
  Record<ProductEventName, ProductEventSpec>
> = CATALOGUE;
