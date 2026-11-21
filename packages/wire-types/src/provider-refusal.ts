export type ProviderRefusalCode = "no_provider" | "provider_account_blocked";

export interface ProviderRefusal {
  code: ProviderRefusalCode;
  error: string;
  provider?: string;
}

const CODES: readonly string[] = ["no_provider", "provider_account_blocked"];

export function parseProviderRefusal(body: unknown): ProviderRefusal | null {
  if (typeof body !== "object" || body === null) return null;
  const value = body as Record<string, unknown>;
  if (
    typeof value.code !== "string" ||
    !CODES.includes(value.code) ||
    typeof value.error !== "string"
  )
    return null;
  const refusal: ProviderRefusal = {
    code: value.code as ProviderRefusalCode,
    error: value.error,
  };
  if (typeof value.provider === "string" && value.provider !== "")
    refusal.provider = value.provider;
  return refusal;
}

export function parseProviderRefusalText(text: string): ProviderRefusal | null {
  try {
    return parseProviderRefusal(JSON.parse(text));
  } catch {
    return null;
  }
}
