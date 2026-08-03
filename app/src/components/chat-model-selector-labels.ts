/**
 * The chat model picker's user-facing strings, translated from the `chat`
 * namespace. Split from `chat-model-selector.tsx` so the container stays under
 * the file-size budget; the mapping from i18n keys to `ModelPickerLabels` is the
 * only thing here.
 */

import type { ModelPickerLabels } from "@houston-ai/core";
import type { Capabilities, CredentialScope } from "@houston-ai/engine-client";
import type { useTranslation } from "react-i18next";
import { canSeeAiModelsPage } from "../lib/org-roles.ts";

/**
 * Which "nothing is connected" story the picker tells (HOU-979).
 *
 * A team space with no credential used to render a blank provider list with no
 * explanation, which reads as a broken app rather than as the honest first state
 * of a new space. Two variants, because there are two genuinely different
 * situations — and NEITHER is "ask an admin":
 *
 *  - `personal` — single player. Their own space, their own connect.
 *  - `team`     — a team space. Every agent there runs on the AI account of
 *                 whoever messages it (HOU-976), so the person reading this is
 *                 always the person who can fix it. The old third variant
 *                 ("ask a team owner or admin to connect an AI model") is gone
 *                 with the shared team account it described: there is no
 *                 credential an admin could connect on a member's behalf.
 */
export type PickerEmptyState = "personal" | "team";

/** The empty-state copy to use, and whether its action may render at all. */
export interface PickerEmptyStateDecision {
  variant: PickerEmptyState;
  /**
   * Whether the viewer can reach the AI Models hub — gates BOTH the empty
   * state's button and the picker's "Connect another AI…" footer.
   */
  canConnect: boolean;
}

/**
 * Resolve the empty-state variant + whether its action may render, for the
 * active space and viewer.
 *
 * The COPY now depends only on which kind of space this is — the story is the
 * same for every viewer of a team space, because every one of them connects
 * their own account (HOU-976). `capabilitiesLoaded` still gates the ACTION
 * (HOU-979): the surface must not promise a Connect before it knows the
 * deployment describes a hub at all. The surface holds its neutral loading
 * state through that window anyway (`use-picker-view-models` folds the same
 * signal into `catalogState`), so this is belt-and-braces.
 *
 * A capabilities load that FAILS is not "still loading": it settles on the
 * permissive single-player default, since an undescribed deployment is that.
 */
export function pickerEmptyState(opts: {
  teamSpace: boolean;
  capabilities: Capabilities | null;
  capabilitiesLoaded: boolean;
}): PickerEmptyStateDecision {
  return {
    variant: opts.teamSpace ? "team" : "personal",
    canConnect:
      opts.capabilitiesLoaded && canSeeAiModelsPage(opts.capabilities),
  };
}

/**
 * The name of the ACCOUNT a provider's models run on, for a picker row's
 * subtitle (HOU-976): "your account" / "team account".
 *
 * `null` scope means the deployment never said which account answered — desktop,
 * self-host, a personal space, a gateway predating the field — and returns
 * `undefined`, which leaves the subtitle exactly as it reads today. Kept beside
 * `buildLabels` because this is the picker's other i18n boundary: the pure row
 * builders take the finished string as data.
 */
export function pickerAccountLabel(
  t: ReturnType<typeof useTranslation<"chat">>[0],
  scope: CredentialScope | null,
): string | undefined {
  if (scope === null) return undefined;
  return t(`modelSelector.picker.account.${scope}`);
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
