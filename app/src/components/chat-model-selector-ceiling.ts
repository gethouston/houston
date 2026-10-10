/**
 * The picker's empty state when the agent's allowed-models ceiling, not a
 * missing connection, leaves it with nothing to offer (PRODUCT-2074).
 *
 * The clamp (`clampPickerToCeiling`) drops every provider whose models the
 * ceiling turns off. When that drops ALL of them, the picker used to fall
 * through to "Connect an AI to start chatting" for someone who already has one
 * connected: connecting another would change nothing. This names the real
 * cause and the one person who can fix it. Pure, so the decision is unit-tested
 * (`app/tests/picker-ceiling-empty.test.ts`).
 */

import type { ModelPickerLabels, ModelPickerProvider } from "@houston-ai/core";
import type { useTranslation } from "react-i18next";

/**
 * Which ceiling story the empty picker tells:
 *
 *  - `connect`     — an AI the viewer has not connected offers an allowed
 *                    model, so connecting it is the fix: the picker's own
 *                    connect action, gated exactly as it always was.
 *  - `choose`      — no AI offers an allowed model; the viewer manages the
 *                    agent and its Models settings exist here, so the empty
 *                    state offers the way there.
 *  - `ask`         — no AI offers an allowed model and someone else manages
 *                    the agent; no action, just who to ask.
 *  - `unreachable` — no AI offers an allowed model and the viewer manages the
 *                    agent, but this space has no Models settings to open (a
 *                    personal space). No action rather than a dead end.
 */
export type CeilingEmptyState = "connect" | "choose" | "ask" | "unreachable";

type Connection = Pick<ModelPickerProvider, "connection">;

const connectedCount = (providers: readonly Connection[]) =>
  providers.filter((p) => p.connection === "connected").length;

/**
 * The ceiling story, or `null` when the ceiling is not why the picker is empty
 * (nothing connected at all, catalog still loading, or something survived the
 * clamp), which leaves the connect copy exactly as it was.
 */
export function ceilingEmptyState(opts: {
  catalogState: "loading" | "ready";
  /** The picker's providers before the ceiling clamp. */
  unclamped: readonly Connection[];
  /**
   * The same list after it. A provider survives the clamp when it offers an
   * allowed model, connected or not (`picker.models` covers every visible
   * provider), so a disconnected survivor is an AI worth connecting.
   */
  clamped: readonly Connection[];
  /** The viewer may open this agent's settings (`canOpenAgentSettings`). */
  canManageAgent: boolean;
  /** `agentSettingsSections(...)` includes `"models"` in this space. */
  modelsSectionReachable: boolean;
}): CeilingEmptyState | null {
  if (opts.catalogState !== "ready") return null;
  if (connectedCount(opts.unclamped) === 0) return null;
  if (connectedCount(opts.clamped) > 0) return null;
  if (opts.clamped.length > 0) return "connect";
  if (!opts.canManageAgent) return "ask";
  return opts.modelsSectionReachable ? "choose" : "unreachable";
}

/**
 * The empty-state action for a story, in `ModelPicker`'s `onEmptyStateAction`
 * terms: `undefined` keeps the picker's connect action (no story, or
 * `connect`), the Models-settings opener for `choose`, and `null` (no button)
 * for the stories nobody standing here can act on.
 */
export function ceilingEmptyAction(
  state: CeilingEmptyState | null,
  chooseModels: () => void,
): (() => void) | null | undefined {
  if (state === null || state === "connect") return undefined;
  return state === "choose" ? chooseModels : null;
}

/**
 * The empty-state labels for a ceiling story. Only the three empty-state
 * strings change; the action label is always supplied, and whether it RENDERS
 * is {@link ceilingEmptyAction}. `connect` reuses the picker's Connect AI label,
 * since its button is that same action.
 */
export function ceilingEmptyLabels(
  t: ReturnType<typeof useTranslation<"chat">>[0],
  state: CeilingEmptyState,
): Pick<
  ModelPickerLabels,
  "noProviders" | "noProvidersHint" | "noProvidersAction"
> {
  return {
    noProviders: t("modelSelector.picker.ceilingEmpty.title"),
    noProvidersHint: t(`modelSelector.picker.ceilingEmpty.hint.${state}`),
    noProvidersAction: t(
      state === "connect"
        ? "modelSelector.picker.noProviders.action"
        : "modelSelector.picker.ceilingEmpty.action",
    ),
  };
}
