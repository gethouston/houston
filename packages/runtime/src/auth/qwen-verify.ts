import type { Model } from "@earendil-works/pi-ai";
import { classifyProviderError } from "../ai/provider-error";
import { QWEN_REGIONS, qwenModels, setQwenRegion } from "../ai/qwen-dashscope";
import { noVerdict, PROVES_AUTH, rejected } from "./verify-errors";

/**
 * Qwen's region gate at connect time (HOU-1077). Alibaba Model Studio
 * international keys are REGION-SCOPED: a key answers `invalid_api_key` on
 * every region but the one it was created in (verified live — a US-Virginia
 * key rejected on Singapore, authenticated on the US endpoint). The user has
 * no idea which region their console picked, so "paste it again" would be a
 * dead end: probe every region and PERSIST the one that accepts the key
 * (`setQwenRegion`), which every later model read serves.
 *
 * The nvidia-verify sibling retries MODELS on one endpoint; this retries
 * ENDPOINTS with one model. Same shape: the probe is injected so the loop is
 * unit-testable without network.
 */

/** A completion probe: `null` = the provider accepted the request. */
type Probe = (model: Model<"openai-completions">) => Promise<string | null>;

export async function verifyQwenRegions(
  providerId: string,
  probe: Probe,
  // Where the accepting region lands. The default writes the LIVE runtime's
  // data dir; a pool worker persists into the hydrated agent root instead
  // (op-credential.ts), where it syncs back beside settings.json.
  persist: (regionId: string) => void = setQwenRegion,
): Promise<void> {
  // The default (first-listed) model carries the active region's URL; probe
  // each candidate region by swapping the base URL alone.
  const probeModel = qwenModels()[0];
  let authFailure: string | null = null;
  let otherFailure: string | null = null;
  for (const region of QWEN_REGIONS) {
    const message = await probe({ ...probeModel, baseUrl: region.baseUrl });
    if (message === null) {
      persist(region.id);
      return;
    }
    const kind = classifyProviderError({
      provider: providerId,
      model: probeModel.id,
      message,
    }).kind;
    if (PROVES_AUTH.has(kind)) {
      persist(region.id);
      return;
    }
    if (kind === "unauthenticated") {
      authFailure = message;
      continue;
    }
    // Outage/network on this region: keep probing the others — the key may
    // still verify where it belongs.
    otherFailure = otherFailure ?? message;
  }
  // Every region rejected the credential itself → the key is wrong. But if
  // any region gave NO verdict, the key might belong there — "try again",
  // never "paste it again" (which could burn a perfectly good key).
  if (otherFailure) throw noVerdict(providerId, otherFailure);
  throw rejected(providerId, authFailure ?? "unknown provider error");
}
