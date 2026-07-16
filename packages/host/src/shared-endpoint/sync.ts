import type {
  OrgSharedEndpoint,
  SharedEndpointStore,
} from "../credentials/remote-shared-endpoint-store";
import type { RuntimeEndpoint } from "../ports";

interface RuntimeEndpointDescriptor {
  baseUrl: string;
  model: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
}

interface RuntimeSharedEndpointStatus {
  configured: boolean;
  orgShared: boolean;
  endpoint?: RuntimeEndpointDescriptor;
}

interface SyncSharedEndpointOptions {
  store: SharedEndpointStore;
  runtime: RuntimeEndpoint;
  fetchImpl?: typeof fetch;
  log?: (message: string, error: unknown) => void;
}

function authHeaders(runtime: RuntimeEndpoint): Record<string, string> {
  return { Authorization: `Bearer ${runtime.token}` };
}

async function runtimeStatus(
  runtime: RuntimeEndpoint,
  fetchImpl: typeof fetch,
): Promise<RuntimeSharedEndpointStatus> {
  const res = await fetchImpl(
    `${runtime.baseUrl}/providers/openai-compatible`,
    { headers: authHeaders(runtime) },
  );
  if (!res.ok) {
    throw new Error(`runtime shared endpoint status failed (${res.status})`);
  }
  return (await res.json()) as RuntimeSharedEndpointStatus;
}

async function seedRuntime(
  runtime: RuntimeEndpoint,
  shared: OrgSharedEndpoint,
  fetchImpl: typeof fetch,
): Promise<void> {
  const res = await fetchImpl(
    `${runtime.baseUrl}/providers/openai-compatible`,
    {
      method: "POST",
      headers: {
        ...authHeaders(runtime),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        baseUrl: shared.baseUrl,
        model: shared.model,
        ...(shared.name !== null ? { name: shared.name } : {}),
        ...(shared.contextWindow !== null
          ? { contextWindow: shared.contextWindow }
          : {}),
        reasoning: shared.reasoning,
        apiKey: shared.apiKey,
        orgShared: true,
      }),
    },
  );
  if (!res.ok)
    throw new Error(`runtime shared endpoint seed failed (${res.status})`);
}

async function clearRuntime(
  runtime: RuntimeEndpoint,
  fetchImpl: typeof fetch,
): Promise<void> {
  const res = await fetchImpl(
    `${runtime.baseUrl}/auth/openai-compatible/logout`,
    {
      method: "POST",
      headers: authHeaders(runtime),
    },
  );
  if (!res.ok) {
    throw new Error(`runtime shared endpoint clear failed (${res.status})`);
  }
}

/** Synchronize one freshly spawned runtime without making pod startup fatal. */
export async function syncSharedEndpoint(
  opts: SyncSharedEndpointOptions,
): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const [shared, status] = await Promise.all([
      opts.store.get(),
      runtimeStatus(opts.runtime, fetchImpl),
    ]);
    if (!shared) {
      if (status.orgShared) await clearRuntime(opts.runtime, fetchImpl);
      return;
    }
    if (status.configured && !status.orgShared) return;
    // Always re-seed an org-hydrated endpoint, even when the visible
    // descriptor is identical: the status deliberately never exposes the api
    // key, and the owner's guided RECONNECT mints a fresh proxyKey under the
    // SAME tunnel URL — a descriptor-equality skip would strand teammates on
    // the dead key. One small write per runtime spawn is the cheap side.
    await seedRuntime(opts.runtime, shared, fetchImpl);
  } catch (error) {
    (opts.log ?? console.error)(
      "[shared-endpoint] runtime sync failed (continuing):",
      error,
    );
  }
}
