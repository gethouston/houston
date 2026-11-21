export const SUPPORTED_LOCALES = ["en", "es", "pt"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_PREF_KEY = "locale";

export function isSupported(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

export function normalizeLocale(
  value: string | null | undefined,
): SupportedLocale | null {
  if (!value) return null;
  const base = value.toLowerCase().split(/[-_]/)[0];
  return isSupported(base) ? base : null;
}

export function resolveEffectiveLocale(
  workspaceLocale: string | null | undefined,
  globalLocale: string | null | undefined,
): SupportedLocale | null {
  return normalizeLocale(workspaceLocale) ?? normalizeLocale(globalLocale);
}

export function localeToApply(
  raw: string | null,
  current: string | undefined,
): SupportedLocale | null {
  const locale = normalizeLocale(raw);
  if (!locale) return null;
  if (locale === current) return null;
  return locale;
}

export function localeGateIsLoading(
  globalQueryLoading: boolean,
  applied: boolean,
): boolean {
  return globalQueryLoading || !applied;
}
