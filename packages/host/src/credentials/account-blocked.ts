export { PROVIDER_ACCOUNT_BLOCKED_CODE } from "@houston/protocol";

const DETAIL_LIMIT = 200;

export class ProviderAccountBlockedError extends Error {
  constructor(
    readonly provider: string,
    readonly detail: string,
  ) {
    super(`provider account blocked for ${provider}: ${detail}`);
    this.name = "ProviderAccountBlockedError";
  }
}

export function accountBlockedDetail(
  status: number,
  text: string,
): string | null {
  if (status !== 403) return null;
  const message = providerMessage(text) ?? text;
  const lower = message.toLowerCase();
  if (!lower.includes("billing") || !lower.includes("locked")) return null;
  return message.trim().slice(0, DETAIL_LIMIT);
}

export function mintFailureStatus(message: string): number | null {
  const match = /^(\d{3})\b/.exec(message);
  return match ? Number(match[1]) : null;
}

function providerMessage(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let parsed: {
    message?: unknown;
    error_details?: { message?: unknown } | null;
  };
  try {
    parsed = JSON.parse(text.slice(start)) as typeof parsed;
  } catch {
    return null;
  }
  const nested = parsed.error_details?.message;
  if (typeof nested === "string" && nested !== "") return nested;
  return typeof parsed.message === "string" && parsed.message !== ""
    ? parsed.message
    : null;
}
