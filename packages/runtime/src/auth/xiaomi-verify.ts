import type { Api, Model } from "@earendil-works/pi-ai";
import { classifyProviderError } from "../ai/provider-error";
import { setXiaomiEndpoint, xiaomiProbeOrder } from "../ai/xiaomi-endpoint";
import { noVerdict, PROVES_AUTH, rejected } from "./verify-errors";

type Probe = (model: Model<Api>) => Promise<string | null>;

export async function verifyXiaomiEndpoints(
  providerId: string,
  key: string,
  probeModel: Model<Api>,
  probe: Probe,
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
    otherFailure = otherFailure ?? message;
  }
  if (otherFailure) throw noVerdict(providerId, otherFailure);
  throw rejected(providerId, authFailure ?? "unknown provider error");
}
