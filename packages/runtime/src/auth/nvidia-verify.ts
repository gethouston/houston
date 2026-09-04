import { extractHttpStatus, isNvidiaFunctionGated } from "../ai/provider-error";
import { safeGetModel } from "../ai/providers";
import { ApiKeyVerifyError } from "./verify-errors";

/**
 * NVIDIA's per-account model gate at connect time (HOU-890). NVIDIA serves
 * each hosted model ("function") per account, so the verify probe's model
 * being gated proves nothing about the KEY — verified live: the same key
 * answered `404 Not found for account` on gemma and 200 on llama. Before any
 * verdict, retry broadly-served models; only when EVERY probe is gated is the
 * account behind the "Public API Endpoints" wall, and that verdict must be
 * `key_restricted` — NOT invalid_key ("paste it again") and NOT
 * provider_unavailable ("try again in a moment"), neither of which can work.
 */

/** A completion probe: `null` = the provider accepted the request. */
type Probe = (model: ReturnType<typeof safeGetModel>) => Promise<string | null>;

/**
 * Models served to every NVIDIA account we have evidence from. The retired
 * llama-3.x rows (the old small non-reasoning probes) left pi's catalog in
 * 0.84.4 and gpt-oss-120b in 0.85.0; of the families our partially-gated live
 * key was served (llama / gpt-oss / minimax), gpt-oss-20b survives (MoE-fast)
 * with minimax-m3 as a second family so a gpt-oss-wide gate still can't
 * produce a false `key_restricted`. The first is also the runtime's NVIDIA default
 * model (`UNCURATED_DEFAULT_MODEL`) and the classifier's suggested fallback.
 */
const NVIDIA_VERIFY_FALLBACKS = ["openai/gpt-oss-20b", "minimaxai/minimax-m3"];

export function nvidiaGated(providerId: string, message: string): boolean {
  return isNvidiaFunctionGated(
    providerId,
    message.toLowerCase(),
    extractHttpStatus(message),
  );
}

/**
 * Resolve a gated first probe: `null` = a fallback model verified the key.
 * A non-gated failure is returned so the caller's normal classification (403
 * bad key, network, …) owns the verdict; all-gated throws `key_restricted`.
 */
export async function retryNvidiaFallbacks(
  providerId: string,
  triedModelId: string,
  gatedMessage: string,
  probe: Probe,
): Promise<string | null> {
  for (const id of NVIDIA_VERIFY_FALLBACKS) {
    if (id === triedModelId) continue;
    let fallback: ReturnType<typeof safeGetModel>;
    try {
      fallback = safeGetModel(providerId, id, true);
    } catch {
      continue; // catalog drift — this fallback id no longer exists
    }
    const message = await probe(fallback);
    if (message === null) return null;
    if (!nvidiaGated(providerId, message)) return message;
    gatedMessage = message;
  }
  throw new ApiKeyVerifyError(
    `${providerId} accepted the key, but this NVIDIA account is not being served any of the chat models Houston tried (${gatedMessage})`,
    "key_restricted",
  );
}
