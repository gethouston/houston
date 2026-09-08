import type {
  Context,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/api/openai-completions";
import type { ManagedBridgeEndpoint } from "@houston/protocol";
import { currentActingContext } from "../session/acting-context";

export interface LocalModelTransportContext {
  baseUrl: string;
  orgSlug: string;
  agentSlug: string;
  hostToken: string;
}

function trustedContext(): LocalModelTransportContext {
  const acting = currentActingContext();
  const scoped = acting?.localModelTransport;
  if (scoped) return scoped;
  if (acting?.authPath)
    throw new Error("local model bridge transport unavailable");
  const {
    HOUSTON_CREDENTIALS_URL: baseUrl,
    HOUSTON_ORG_SLUG: orgSlug,
    HOUSTON_AGENT_SLUG: agentSlug,
    HOUSTON_HOST_TOKEN: hostToken,
  } = process.env;
  if (!baseUrl || !orgSlug || !agentSlug || !hostToken)
    throw new Error("local model bridge transport unavailable");
  return { baseUrl, orgSlug, agentSlug, hostToken };
}

export function bridgeFetch(
  bridge: ManagedBridgeEndpoint,
  model: string,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  // Capture credentials inside the turn's async subtree, never at provider registration.
  const context = trustedContext();
  const actingAs = currentActingContext()?.actingAs;
  if (!actingAs) throw new Error("local model bridge authorization required");
  const origin = new URL(context.baseUrl);
  if (
    !["https:", "http:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  )
    throw new Error("invalid trusted bridge callback");
  const prefix = `/v1/pod/local-model-bridges/${encodeURIComponent(context.orgSlug)}/${encodeURIComponent(context.agentSlug)}/${encodeURIComponent(bridge.id)}/v1/`;
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const operation =
      url.pathname.endsWith("/chat/completions") && request.method === "POST"
        ? "chat/completions"
        : url.pathname.endsWith("/models") && request.method === "GET"
          ? "models"
          : null;
    if (!operation) throw new Error("unsupported local model operation");
    const headers = new Headers({
      Authorization: `Bearer ${context.hostToken}`,
      "x-houston-acting-as": actingAs,
      "x-houston-bridge-model": model,
    });
    if (operation === "chat/completions")
      headers.set("content-type", "application/json");
    headers.set(
      "accept",
      request.headers.get("accept") === "text/event-stream"
        ? "text/event-stream"
        : "application/json",
    );
    return fetchImpl(
      new Request(new URL(prefix + operation, origin.origin), {
        method: request.method,
        headers,
        body: request.body,
        signal: request.signal,
        redirect: "error",
        ...(request.body ? { duplex: "half" } : {}),
      }),
    );
  };
}

export function streamBridge(
  bridge: ManagedBridgeEndpoint,
  model: Model<"openai-completions">,
  context: Context,
  options?: SimpleStreamOptions,
) {
  return streamSimple(model, context, {
    ...options,
    apiKey: "bridge",
    maxRetries: 0,
    fetch: bridgeFetch(bridge, model.id),
  });
}

export async function probeBridge(
  bridge: ManagedBridgeEndpoint,
  model: string,
): Promise<boolean> {
  try {
    const response = await bridgeFetch(bridge, model)(
      "https://local-model.invalid/v1/models",
      { signal: AbortSignal.timeout(2000) },
    );
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return (
      typeof result === "object" &&
      result !== null &&
      "data" in result &&
      Array.isArray(result.data) &&
      result.data.some(
        (entry: unknown) =>
          typeof entry === "object" &&
          entry !== null &&
          "id" in entry &&
          entry.id === model,
      )
    );
  } catch (error) {
    console.warn(
      "[local-model-bridge] readiness probe failed",
      error instanceof Error ? error.name : "unknown",
    );
    return false;
  }
}
