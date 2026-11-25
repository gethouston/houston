import { identityConfig } from "./config.ts";
import type { TokenSignInResult } from "./firebase-rest.ts";
import { refreshIdToken } from "./firebase-rest.ts";
import { identityLog } from "./log.ts";

export const MIN_REMAINING_MS = 60_000;

// WHY: expires_in counts from read time; date expiry from the send so a slept answer is not fresh. ADR-0070
export function expiresAtFromSend(
  startedAtMs: number,
  minted: TokenSignInResult,
  readAtMs: number,
): number {
  return minted.expiresAt - (readAtMs - startedAtMs);
}

export function isSleptOut(expiresAtMs: number, nowMs: number): boolean {
  return expiresAtMs - nowMs <= MIN_REMAINING_MS;
}

async function mintOnce(refreshToken: string): Promise<TokenSignInResult> {
  const startedAt = Date.now();
  const minted = await refreshIdToken({
    apiKey: identityConfig.apiKey,
    refreshToken,
  });
  return {
    ...minted,
    expiresAt: expiresAtFromSend(startedAt, minted, Date.now()),
  };
}

export async function mintUsableIdToken(
  refreshToken: string,
): Promise<TokenSignInResult> {
  const first = await mintOnce(refreshToken);
  if (!isSleptOut(first.expiresAt, Date.now())) return first;
  identityLog(
    "warn",
    `refresh answer outlived its token in flight (${Math.round((Date.now() - first.expiresAt) / 1000)}s past expiry on read); minting again`,
    "identity/refresh",
  );
  return mintOnce(first.refreshToken);
}
