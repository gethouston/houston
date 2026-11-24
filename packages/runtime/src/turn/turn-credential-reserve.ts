import { RemoteCredentialStore } from "@houston/host/src/credentials/remote-store";
import {
  applyServedCredential,
  type ServedCredential,
} from "../auth/auth-file";
import type { TurnCredentialChannel } from "../auth/turn-credential-channel";

export const TURN_RESERVE_TIMEOUT_MS = 10_000;

export type TurnReserveResult = "served" | "not_connected" | "failed";

export async function reserveTurnCredential(
  channel: TurnCredentialChannel,
  authPath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnReserveResult> {
  const remote = new RemoteCredentialStore({
    baseUrl: channel.baseUrl,
    orgSlug: channel.orgSlug,
    agentSlug: channel.agentSlug,
    podToken: channel.hostToken,
    fetchImpl: (input, init) =>
      fetchImpl(input, {
        ...init,
        signal: AbortSignal.timeout(TURN_RESERVE_TIMEOUT_MS),
      }),
  });
  try {
    const served = await remote.get(
      channel.orgSlug,
      channel.provider,
      channel.actingAs ? { actingAs: channel.actingAs } : undefined,
    );
    if (!served) return "not_connected";
    const credential: ServedCredential = {
      provider: served.provider,
      access: served.accessToken,
      expires: served.expiresAt,
      accountId: served.accountId ?? null,
      kind: served.kind === "api_key" ? "api_key" : "oauth",
      ...(served.enterpriseUrl ? { enterpriseUrl: served.enterpriseUrl } : {}),
    };
    applyServedCredential(authPath, credential);
    return "served";
  } catch (error) {
    console.error(
      `[turn-credential] re-serving the ${channel.provider} credential mid-turn failed:`,
      error instanceof Error ? error.message : String(error),
    );
    return "failed";
  }
}
