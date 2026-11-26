import { join } from "node:path";
import type { CustomIntegrationManager } from "@houston/host/src/integrations/custom/manager";
import { preloadCustomIntegrationModules } from "./custom-integration-loader";
import type { OpRequest } from "./parse-op-request";
import type { TurnFilesystem } from "./turn-filesystem";
import { poolIdentity } from "./turn-store";

/** The store-root definitions file custom-integration ops read and write. */
export const CUSTOM_DEFS_FILE = "custom-integrations.json";

export interface CustomContext {
  manager: CustomIntegrationManager;
  /** The slugs this op's mutations changed (empty = nothing changed). */
  touched: ReadonlySet<string>;
  dispose: () => Promise<void>;
  readonly secretWritten: boolean;
}

/**
 * A per-op custom-integration manager for a route op on a pool worker:
 * definitions at the store root, secrets in the gateway's custom-secret
 * store, a fresh in-memory executor. OAuth attempts are held by the gateway.
 */
export async function customIntegrationContext(
  op: Pick<
    OpRequest,
    "gcsPrefix" | "hostToken" | "claim" | "customOAuthCallbackUrl"
  >,
  filesystem: TurnFilesystem,
  fetchImpl?: typeof fetch,
): Promise<CustomContext> {
  // Materialize the store-root definitions file into the lazy overlay (and
  // its manifest) BEFORE the raw-fs store reads it: an unmaterialized file
  // would read as "no definitions" and a later write would CAS-create over
  // the real one.
  await filesystem.vfs.readBytes(CUSTOM_DEFS_FILE);
  // Imported lazily: the embedded executor engine is heavy, and only the
  // rare custom-integration op needs it — worker startup must not pay it.
  const [
    { CustomExecutorHost },
    { CustomIntegrationManager },
    ,
    { RemoteCustomSecretStore },
    { FileCustomIntegrationStore },
  ] = await preloadCustomIntegrationModules();
  const { org, agent } = poolIdentity(op.gcsPrefix);
  const store = new FileCustomIntegrationStore(
    join(filesystem.storeRoot, CUSTOM_DEFS_FILE),
  );
  const secrets = new RemoteCustomSecretStore({
    baseUrl: new URL(op.claim.heartbeatUrl).origin,
    orgSlug: org,
    agentSlug: agent,
    podToken: op.hostToken,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  let secretWritten = false;
  const trackedSecrets = {
    get: (id: string) => secrets.get(id),
    delete: (id: string) => secrets.delete(id),
    set: async (id: string, value: string) => {
      await secrets.set(id, value);
      secretWritten = true;
    },
  };
  const executor = new CustomExecutorHost(trackedSecrets, () => store.list());
  const touched = new Set<string>();
  const manager = new CustomIntegrationManager(
    store,
    trackedSecrets,
    executor,
    (slug) => {
      touched.add(slug);
    },
    // An older gateway omits callback custody; its add/detect routes decline
    // to the pod, whose in-memory attempt owns the browser return leg.
    op.customOAuthCallbackUrl
      ? {
          callbackUrl: op.customOAuthCallbackUrl,
          statePrefix: `${org}.${agent}`,
          ...(fetchImpl ? { fetchFn: fetchImpl } : {}),
        }
      : fetchImpl
        ? { fetchFn: fetchImpl }
        : {},
  );
  return {
    manager,
    touched,
    get secretWritten() {
      return secretWritten;
    },
    dispose: () => executor.reset(),
  };
}
