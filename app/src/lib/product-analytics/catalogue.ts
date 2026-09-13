/**
 * WHAT HOUSTON GATHERS ABOUT PRODUCT USAGE — the whole list, in one table.
 *
 * The gateway's Postgres is the single source of truth for product analytics,
 * and the split between the two writers is deliberate:
 *
 *  - the SERVER writes every fact it can observe by itself (an account being
 *    minted, a conversation message it accepted, an account deletion). Those
 *    names are server-owned: the ingest route refuses them from a client, so a
 *    tampered or buggy app can never manufacture them.
 *  - the CLIENT sends only INTENT the server can never see — which answer was
 *    confirmed, which skill was invoked, which screen was opened. That is
 *    exactly this table, and nothing outside it leaves the device.
 *
 * PostHog is untouched and entirely separate: `analytics.track` still reports
 * to it from the same call sites, and this catalogue only decides which of
 * those beats ALSO ride the first-party pipe. Adding a name here is the only
 * way to gather something new — there are no other client event sources.
 */

import type { AnalyticsEventName, AnalyticsProperty } from "../analytics.ts";

/** The only value shapes the ingest route accepts. */
export type ProductEventValue = string | number | boolean;

export type ProductEventProps = Partial<
  Record<AnalyticsProperty, ProductEventValue>
>;

interface ProductEventSpec {
  /** One sentence: what this event means, for whoever reads the table. */
  readonly definition: string;
  /** The only property keys that ride this event. Everything else is dropped. */
  readonly props: readonly AnalyticsProperty[];
}

/**
 * Keyed by `AnalyticsEventName` on purpose: a name that is not a real tracked
 * event, or a property key that is not a real tracked property, fails the
 * build rather than going quiet in production.
 */
const CATALOGUE = {
  session_started: {
    definition:
      "The app launched (or reloaded) and reached a signed-in hosted session.",
    props: [],
  },
  onboarding_completed: {
    definition: "The first-run onboarding flow finished.",
    props: [],
  },
  onboarding_segment_continued: {
    definition: "The user confirmed their segment answer.",
    props: ["selected_segment", "source_screen"],
  },
  onboarding_industry_continued: {
    definition: "The user confirmed their industry answer.",
    props: ["selected_industry", "source_screen"],
  },
  onboarding_goal_continued: {
    definition:
      "The user submitted the automation-goal step (the text never leaves the device).",
    props: ["goal_provided", "source_screen"],
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

export const PRODUCT_EVENTS: Readonly<
  Record<ProductEventName, ProductEventSpec>
> = CATALOGUE;

/**
 * Names only the gateway may write. Listed so the boundary is readable from
 * this side too — the route rejects them, and they are absent from the table
 * above, so the client has no way to send one.
 */
export const SERVER_OWNED_EVENTS = [
  "user_signed_up",
  "chat_message_sent",
  "account_deleted",
] as const satisfies readonly AnalyticsEventName[];

/** Longest string a property value may carry; the route refuses more. */
const PROP_VALUE_MAX = 512;

export function isProductEvent(name: string): name is ProductEventName {
  return Object.hasOwn(CATALOGUE, name);
}

/**
 * The allowed subset of `props` for this event, with every value coerced into
 * what the route accepts. An over-long string is truncated rather than
 * dropped: the route rejects the WHOLE event on one invalid property, so
 * trimming a runaway slug keeps the event itself countable.
 */
export function pickProductProps(
  name: ProductEventName,
  props?: Record<string, unknown>,
): ProductEventProps {
  const picked: ProductEventProps = {};
  if (!props) return picked;
  for (const key of CATALOGUE[name].props) {
    const value = props[key];
    if (typeof value === "string") picked[key] = value.slice(0, PROP_VALUE_MAX);
    else if (typeof value === "number" && Number.isFinite(value))
      picked[key] = value;
    else if (typeof value === "boolean") picked[key] = value;
  }
  return picked;
}
