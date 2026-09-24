/**
 * The device's appearance as the surface reaches it: the engine calls behind
 * `./theme`, wrapped in the same error-surfacing policy every other engine call
 * gets.
 *
 * Part of `./tauri` rather than a layer of its own. It sits in its own file only
 * because that module is the app's whole engine-facing surface and has no business
 * growing a namespace per feature; it reaches the engine through `getEngine()`
 * and its failures through `engineCall`, exactly as the namespaces still living
 * there do (`scripts/check-boundaries.mjs` rule D names this file for that
 * reason).
 *
 * The whole contract is the SDK's appearance module: the three keys, the
 * vocabulary, validation and the diff-only write all live there, so this is a
 * pass-through and nothing else.
 *
 * Neither call toasts or captures: both have their own report path in `./theme`,
 * where the boot read reports and keeps the mirror on screen and a refused write
 * reports and reverts the colours. A red bug toast on top of a reverted palette
 * would name a failure the user cannot act on, twice.
 */

import type { ThemeReading } from "@houston/sdk";
import type { ThemePreference } from "@houston/sdk/appearance";
import { getEngine } from "./engine";
import { engineCall } from "./tauri";

export const tauriTheme = {
  get: () =>
    engineCall<ThemeReading>(
      "get_theme_preference",
      () => getEngine().getThemePreference(),
      undefined,
      { toast: false, capture: false },
    ),
  set: (patch: Partial<ThemePreference>, previous: ThemePreference) =>
    engineCall<ThemePreference>(
      "set_theme_preference",
      () => getEngine().setThemePreference(patch, previous),
      undefined,
      { toast: false, capture: false },
    ),
};
