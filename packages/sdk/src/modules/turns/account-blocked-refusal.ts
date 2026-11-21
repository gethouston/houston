import { FatalResumeError, type ProviderError } from "@houston/runtime-client";
import {
  type ProviderRefusal,
  parseProviderRefusal,
} from "@houston/wire-types";
import { settleProviderErrorCard, type TurnState } from "./turn-settle";

export function providerAccountBlockedRefusal(
  error: unknown,
): ProviderRefusal | null {
  const cause = error instanceof FatalResumeError ? error.cause : error;
  if (!(cause instanceof Error)) return null;
  const { status, body } = cause as { status?: unknown; body?: unknown };
  if (status !== 409) return null;
  let refusal: ProviderRefusal | null;
  if (typeof body === "string") refusal = parseText(body);
  else if (body === undefined) refusal = parseText(cause.message);
  else refusal = parseProviderRefusal(body);
  return refusal?.code === "provider_account_blocked" ? refusal : null;
}

function parseText(text: string): ProviderRefusal | null {
  try {
    return parseProviderRefusal(JSON.parse(text));
  } catch {
    return null;
  }
}

export function accountBlockedCard(
  refusal: ProviderRefusal,
  provider: string | null | undefined,
): ProviderError {
  return {
    kind: "unauthenticated",
    provider: refusal.provider ?? provider ?? "",
    cause: "billing_locked",
    message: refusal.error,
  };
}

export function finishAccountBlocked(
  s: TurnState,
  refusal: ProviderRefusal,
): void {
  if (s.settled) return;
  const card: ProviderError & { failed_prompt?: string } = accountBlockedCard(
    refusal,
    s.provider,
  );
  if (s.prompt) card.failed_prompt = s.prompt;
  settleProviderErrorCard(s, card);
}
