export const PROVIDER_DISPLAY_RENAME: Readonly<Record<string, string>> = {
  "openai-codex": "openai",
};

export const PROVIDER_CANONICAL_RENAME: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(PROVIDER_DISPLAY_RENAME).map(([canonical, display]) => [
      display,
      canonical,
    ]),
  );

export function toDisplayProviderId(id: string): string {
  return PROVIDER_DISPLAY_RENAME[id] ?? id;
}

export function toDisplayProviderIdOrNull(
  id: string | null | undefined,
): string | null {
  return id ? toDisplayProviderId(id) : null;
}

export function toCanonicalProviderId(id: string): string {
  return PROVIDER_CANONICAL_RENAME[id] ?? id;
}

export function toCanonicalProviderIdOrNull(
  id: string | null | undefined,
): string | null {
  return id ? toCanonicalProviderId(id) : null;
}
