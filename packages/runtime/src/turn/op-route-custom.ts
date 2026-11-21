import { join } from "node:path";
import type { CustomIntegrationManager } from "@houston/host/src/integrations/custom/manager";
import { preloadCustomIntegrationModules } from "./custom-integration-loader";
import type { OpRequest } from "./parse-op-request";
import type { TurnFilesystem } from "./turn-filesystem";
import { poolIdentity } from "./turn-store";

export const CUSTOM_DEFS_FILE = "custom-integrations.json";

export interface CustomContext {
  manager: CustomIntegrationManager;
  touched: ReadonlySet<string>;
  dispose: () => Promise<void>;
  readonly secretWritten: boolean;
}

export async function customIntegrationContext(
  op: Pick<
    OpRequest,
    "gcsPrefix" | "hostToken" | "claim" | "customOAuthCallbackUrl"
  >,
  filesystem: TurnFilesystem,
  fetchImpl?: typeof fetch,
): Promise<CustomContext> {
  await filesystem.vfs.readBytes(CUSTOM_DEFS_FILE);
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
    op.customOAuthCallbackUrl
      ? {
          callbackUrl: op.customOAuthCallbackUrl,
          statePrefix: `${org}.${agent}`,
          ...(fetchImpl ? { fetchFn: fetchImpl } : {}),
        }
      : { ...(fetchImpl ? { fetchFn: fetchImpl } : {}) },
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
