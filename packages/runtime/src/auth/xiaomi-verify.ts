import type { Api, Model } from "@earendil-works/pi-ai";
import { classifyProviderError } from "../ai/provider-error";
import { setXiaomiEndpoint, xiaomiProbeOrder } from "../ai/xiaomi-endpoint";
import { noVerdict, PROVES_AUTH, rejected } from "./verify-errors";

/**
 * Xiaomi MiMo's endpoint gate at connect time. A pasted key belongs to
 * exactly one of Xiaomi's endpoints — the general pay-as-you-go host or one
 * of the three Token Plan gateways — and every other endpoint answers 401
 * for it (see `ai/xiaomi-endpoint.ts` for the full story). The user has no
 * idea Houston distinguishes the two products, so "paste it again" would be
 * a dead end: probe every endpoint and PERSIST the accepting one, which
 * every later xiaomi model read overlays.
 *
 * The qwen-verify sibling retries REGIONS for an extension provider; this
 * retries ENDPOINTS for a pi builtin. Same shape: the probe is injected so
 * the loop is unit-testable without network.
 */

/** A completion probe: `null` = the provider accepted the request. */
type Probe = (model: Model<Api>) => Promise<string | null>;

export async function verifyXiaomiEndpoints(
  providerId: string,
  key: string,
  probeModel: Model<Api>,
  probe: Probe,
  // Where the accepting endpoint lands. The default writes the LIVE
  // runtime's data dir; a pool worker persists into the hydrated agent root
  // instead (op-credential.ts), where it syncs back beside settings.json.
  persist: (endpointId: string) => void = setXiaomiEndpoint,
): Promise<void> {
  let authFailure: string | null = null;
  let otherFailure: string | null = null;
  for (const endpoint of xiaomiProbeOrder(key)) {
    const message = await probe({ ...probeModel, baseUrl: endpoint.baseUrl });
    if (message === null) {
      persist(endpoint.id);
      return;
    }
    const kind = classifyProviderError({
      provider: providerId,
      model: probeModel.id,
      message,
    }).kind;
    if (PROVES_AUTH.has(kind)) {
      persist(endpoint.id);
      return;
    }
    if (kind === "unauthenticated") {
      authFailure = message;
      continue;
    }
    // Outage/network on this endpoint: keep probing the others — the key
    // may still verify where it belongs.
    otherFailure = otherFailure ?? message;
  }
  // Every endpoint rejected the credential itself → the key is wrong. But if
  // any endpoint gave NO verdict, the key might belong there — "try again",
  // never "paste it again" (which could burn a perfectly good key).
  if (otherFailure) throw noVerdict(providerId, otherFailure);
  throw rejected(providerId, authFailure ?? "unknown provider error");
}
