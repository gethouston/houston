import { extractHttpStatus, isNvidiaFunctionGated } from "../ai/provider-error";
import { safeGetModel } from "../ai/providers";
import { ApiKeyVerifyError } from "./verify-errors";

type Probe = (model: ReturnType<typeof safeGetModel>) => Promise<string | null>;

const NVIDIA_VERIFY_FALLBACKS = [
  "minimaxai/minimax-m3.1-flash",
  "nvidia/nemotron-3.5-super-vl-120b-a12b",
];

export function nvidiaGated(providerId: string, message: string): boolean {
  return isNvidiaFunctionGated(
    providerId,
    message.toLowerCase(),
    extractHttpStatus(message),
  );
}

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
      continue;
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
