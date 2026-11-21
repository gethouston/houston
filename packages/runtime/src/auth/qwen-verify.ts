import type { Model } from "@earendil-works/pi-ai";
import { classifyProviderError } from "../ai/provider-error";
import { QWEN_REGIONS, qwenModels, setQwenRegion } from "../ai/qwen-dashscope";
import { noVerdict, PROVES_AUTH, rejected } from "./verify-errors";

type Probe = (model: Model<"openai-completions">) => Promise<string | null>;

export async function verifyQwenRegions(
  providerId: string,
  probe: Probe,
  persist: (regionId: string) => void = setQwenRegion,
): Promise<void> {
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
    otherFailure = otherFailure ?? message;
  }
  if (otherFailure) throw noVerdict(providerId, otherFailure);
  throw rejected(providerId, authFailure ?? "unknown provider error");
}
