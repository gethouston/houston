import { completeSimple } from "@earendil-works/pi-ai/compat";
import { classifyProviderError } from "../ai/provider-error";
import { modelFor, safeGetModel } from "../ai/providers";
import { QWEN_PROVIDER_ID } from "../ai/qwen-dashscope";
import { XIAOMI_PROVIDER_ID } from "../ai/xiaomi-endpoint";
import { huggingfaceInferenceGated } from "./huggingface-verify";
import { nvidiaGated, retryNvidiaFallbacks } from "./nvidia-verify";
import { verifyQwenRegions } from "./qwen-verify";
import {
  ApiKeyVerifyError,
  noVerdict,
  PROVES_AUTH,
  raisedMessage,
  rejected,
  VERIFY_TIMEOUT_MS,
} from "./verify-errors";
import { verifyXiaomiEndpoints } from "./xiaomi-verify";

export type { ApiKeyVerifyReason } from "./verify-errors";

export interface VerifyApiKeyOptions {
  azureBaseUrl?: string;
  qwenRegionPersist?: (regionId: string) => void;
  xiaomiEndpointPersist?: (endpointId: string) => void;
  fetch?: typeof fetch;
}
export { ApiKeyVerifyError, raisedMessage } from "./verify-errors";

export async function verifyApiKey(
  providerId: string,
  key: string,
  opts?: VerifyApiKeyOptions,
): Promise<void> {
  if (providerId === QWEN_PROVIDER_ID) {
    await verifyQwenRegions(
      providerId,
      (m) => probeCompletion(providerId, m, key),
      ...(opts?.qwenRegionPersist ? [opts.qwenRegionPersist] : []),
    );
    return;
  }

  const model = safeGetModel(providerId, modelFor(providerId), false);
  if (!model)
    throw new Error(`${providerId} offers no model to verify the key against`);

  if (model.api === "google-generative-ai" && model.baseUrl) {
    await verifyGoogleApiKey(providerId, model.baseUrl, key);
    return;
  }

  if (providerId === XIAOMI_PROVIDER_ID) {
    await verifyXiaomiEndpoints(
      providerId,
      key,
      model,
      (m) => probeCompletion(providerId, m, key),
      ...(opts?.xiaomiEndpointPersist ? [opts.xiaomiEndpointPersist] : []),
    );
    return;
  }

  let message = await probeCompletion(providerId, model, key, opts);
  if (message === null) return;

  if (nvidiaGated(providerId, message)) {
    message = await retryNvidiaFallbacks(providerId, model.id, message, (m) =>
      probeCompletion(providerId, m, key),
    );
    if (message === null) return;
  }

  const hfGated = huggingfaceInferenceGated(providerId, message);
  if (hfGated) throw hfGated;

  const classified = classifyProviderError({
    provider: providerId,
    model: model.id,
    message,
  });
  if (PROVES_AUTH.has(classified.kind)) return;
  if (classified.kind === "unauthenticated")
    throw rejected(providerId, message);
  throw noVerdict(providerId, message);
}

async function probeCompletion(
  providerId: string,
  model: Parameters<typeof completeSimple>[0],
  key: string,
  opts?: VerifyApiKeyOptions,
): Promise<string | null> {
  try {
    const reply = await completeSimple(
      model,
      {
        messages: [{ role: "user", content: "ping", timestamp: Date.now() }],
      },
      {
        apiKey: key,
        maxTokens: 1,
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
        ...(opts?.azureBaseUrl
          ? {
              azureBaseUrl: opts.azureBaseUrl,
              env: { AZURE_OPENAI_BASE_URL: opts.azureBaseUrl },
            }
          : {}),
        ...(opts?.fetch ? { fetch: opts.fetch } : {}),
      },
    );
    if (reply.stopReason !== "error") return null;
    return reply.errorMessage ?? "unknown provider error";
  } catch (e) {
    return raisedMessage(e, providerId);
  }
}

async function verifyGoogleApiKey(
  providerId: string,
  baseUrl: string,
  key: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/models?pageSize=1`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch (e) {
    throw noVerdict(providerId, raisedMessage(e, providerId));
  }
  if (res.ok) return;
  if (res.status === 429) return;
  const message = await googleErrorMessage(res);
  if (res.status === 400 || res.status === 401)
    throw rejected(providerId, message);
  if (res.status === 403) {
    throw new ApiKeyVerifyError(
      `this ${providerId} API key is blocked by its own settings: ${message}`,
      "key_restricted",
    );
  }
  throw noVerdict(providerId, message);
}

async function googleErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {}
  return text || `status ${res.status}`;
}
