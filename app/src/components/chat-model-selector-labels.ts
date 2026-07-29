/**
 * The chat model picker's user-facing strings, translated from the `chat`
 * namespace. Split from `chat-model-selector.tsx` so the container stays under
 * the file-size budget; the mapping from i18n keys to `ModelPickerLabels` is the
 * only thing here.
 */

import type { ModelPickerLabels } from "@houston-ai/core";
import type { Capabilities } from "@houston-ai/engine-client";
import type { useTranslation } from "react-i18next";
import { canSeeAiModelsPage } from "../lib/org-roles.ts";

/**
 * Which "nothing is connected" story the picker tells (HOU-979).
 *
 * A team space with no credential used to render a blank provider list with no
 * explanation, which reads as a broken app rather than as the honest first state
 * of a new space. The three variants are the three genuinely different
 * situations, and they differ in whether the viewer can do anything about it:
 *
 *  - `personal`        — single player. Their own space, their own connect.
 *  - `teamCanConnect`  — a team space, viewed by someone who can reach the AI
 *                        Models hub (owner / admin).
 *  - `teamAskAdmin`    — a team space, viewed by a plain member. Provider
 *                        connections are org-level and the hub is not theirs to
 *                        open, so pointing them at it would dead-end; name who
 *                        can fix it instead.
 */
export type PickerEmptyState = "personal" | "teamCanConnect" | "teamAskAdmin";

/** The empty-state copy to use, and whether its action may render at all. */
export interface PickerEmptyStateDecision {
  variant: PickerEmptyState;
  /**
   * Whether the viewer can reach the AI Models hub — gates BOTH the empty
   * state's button and the picker's "Connect more providers…" footer.
   */
  canConnect: boolean;
}

/**
 * Resolve the empty-state variant + whether its action may render, for the
 * active space and viewer.
 *
 * `capabilitiesLoaded` is load-bearing, not defensive (HOU-979). `role` is
 * per-space and arrives with capabilities; the underlying
 * {@link canSeeAiModelsPage} answers TRUE for capabilities that have not
 * arrived (the single-player default), so deciding early showed a plain team
 * member a Connect action for a beat and then withdrew it. Until they land we
 * make no promise: no action, and the copy that assumes the least. The surface
 * holds its neutral loading state through that window anyway
 * (`use-picker-view-models` folds the same signal into `catalogState`), so the
 * conservative variant is a belt-and-braces default, never a visible flash of
 * "ask an admin" at an owner.
 *
 * A capabilities load that FAILS is not "still loading": it settles on the
 * permissive single-player default, since an undescribed deployment is that.
 */
export function pickerEmptyState(opts: {
  teamSpace: boolean;
  capabilities: Capabilities | null;
  capabilitiesLoaded: boolean;
}): PickerEmptyStateDecision {
  const canConnect =
    opts.capabilitiesLoaded && canSeeAiModelsPage(opts.capabilities);
  if (!opts.teamSpace) return { variant: "personal", canConnect };
  return {
    variant: canConnect ? "teamCanConnect" : "teamAskAdmin",
    canConnect,
  };
}

/**
 * Build the picker's labels from the chat-namespace translator.
 *
 * `emptyState` only swaps the no-providers copy; every other label is shared.
 * The CTA label is always supplied — whether the action RENDERS is decided by
 * the consumer passing (or withholding) `onConnectMore`, so a member never sees
 * a button into a surface they cannot open.
 */
export function buildLabels(
  t: ReturnType<typeof useTranslation<"chat">>[0],
  emptyState: PickerEmptyState,
): Partial<ModelPickerLabels> {
  const k = (key: string) => t(`modelSelector.picker.${key}`);
  return {
    searchPlaceholder: k("searchPlaceholder"),
    connectMore: k("connectMore"),
    back: k("back"),
    providersLabel: k("providersLabel"),
    modelsLabel: k("modelsLabel"),
    loading: k("loading"),
    empty: k("empty"),
    noProviders: k(`noProviders.${emptyState}.title`),
    noProvidersHint: k(`noProviders.${emptyState}.hint`),
    noProvidersAction: k("noProviders.action"),
  };
}
