/**
 * Pure locale value-logic for the Houston desktop app — no i18next, no DOM, no
 * JSON-module imports, so it loads under the bare Node test runner and stays
 * unit-testable. The i18next runtime wiring (init, changeLanguage, the
 * localStorage flash-cache, applying the engine value) lives in `./i18n`, which
 * re-exports everything here so existing `from "../lib/i18n"` imports keep
 * working.
 */

export const SUPPORTED_LOCALES = ["en", "es", "pt"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Engine preference key for the user's chosen UI locale (global default). */
export const LOCALE_PREF_KEY = "locale";

export function isSupported(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/** Normalize a BCP-47 tag (`pt-BR`) to a supported locale (`pt`), or null. */
export function normalizeLocale(
  value: string | null | undefined,
): SupportedLocale | null {
  if (!value) return null;
  const base = value.toLowerCase().split(/[-_]/)[0];
  return isSupported(base) ? base : null;
}

/**
 * Resolve the effective UI locale from the engine's two sources of truth: the
 * active workspace's override wins, otherwise the global `locale` preference.
 * Returns null when neither is set/valid (caller then keeps the detector pick).
 *
 * The engine, never the browser's localStorage cache, owns both, so a fresh
 * browser pointed at a headless engine resolves the right language.
 */
export function resolveEffectiveLocale(
  workspaceLocale: string | null | undefined,
  globalLocale: string | null | undefined,
): SupportedLocale | null {
  return normalizeLocale(workspaceLocale) ?? normalizeLocale(globalLocale);
}

/**
 * Decide which locale (if any) the live UI should switch to, given an
 * engine-resolved value and the currently active language. Returns null to
 * leave the language untouched: the value is unset/invalid, or already active.
 * Pure, so it's unit-testable without an i18next instance; `applyEngineLocale`
 * in `./i18n` wraps it with the actual `changeLanguage` call.
 */
export function localeToApply(
  raw: string | null,
  current: string | undefined,
): SupportedLocale | null {
  const locale = normalizeLocale(raw);
  if (!locale) return null;
  if (locale === current) return null;
  return locale;
}

/** Minimal workspace shape needed to resolve the boot-time active locale. */
export interface WorkspaceLocaleInput {
  id: string;
  isDefault: boolean;
  locale?: string | null;
}

/**
 * Pick the boot-time active workspace's locale override. Mirrors how the app
 * restores the active workspace at startup (see `useHoustonInit`): the
 * last-used workspace wins, else the default, else the first. Returns that
 * workspace's override — which may be null (inherit the global default) — or
 * null when there are no workspaces.
 *
 * Lets the locale gate resolve the override on the FIRST paint, independently
 * of `<App/>` (which mounts below the gate and only then loads workspaces).
 */
export function activeWorkspaceLocale(
  workspaces: WorkspaceLocaleInput[],
  lastWorkspaceId: string | null | undefined,
): string | null {
  if (workspaces.length === 0) return null;
  const active =
    (lastWorkspaceId
      ? workspaces.find((w) => w.id === lastWorkspaceId)
      : undefined) ??
    workspaces.find((w) => w.isDefault) ??
    workspaces[0];
  return active.locale ?? null;
}

/**
 * Whether the first-run `LanguageGate` must keep blocking the first paint.
 *
 * ONLY the global locale preference gates the paint: it decides the language
 * (and whether to show the first-run picker) and is a tiny KV read. The
 * per-workspace override (`bootWorkspaceQuery`) is best-effort and applied on
 * arrival, so it MUST NOT be a factor here — it takes no parameter by design.
 *
 * Blocking the gate on that override is what hung the whole app on launch: a
 * non-settling `GET /workspaces` left the gate loading forever, so `<App/>`
 * never mounted and the window stayed blank (gethouston/houston#439).
 */
export function localeGateIsLoading(
  globalQueryLoading: boolean,
  applied: boolean,
): boolean {
  return globalQueryLoading || !applied;
}
