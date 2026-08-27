import { join } from "node:path";
import type { CustomIntegrationManager } from "@houston/host/src/integrations/custom/manager";
import type { CustomIntegrationProvider } from "@houston/host/src/integrations/custom/provider";
import type { TurnFilesystem } from "./turn-filesystem";

const CUSTOM_DEFS_FILE = "custom-integrations.json";

/** Per-turn custom-integration manager, provider, and owned resources. */
export interface TurnCustomContext {
  manager: CustomIntegrationManager;
  provider: CustomIntegrationProvider;
  dispose: () => Promise<void>;
}

/** Build a custom-integration context over the hydrated definitions and remote secrets. */
export async function createTurnCustomContext(opts: {
  filesystem: TurnFilesystem;
  grantUrl: string;
  hostToken: string;
  orgSlug: string;
  agentSlug: string;
  fetchImpl?: typeof fetch;
}): Promise<TurnCustomContext> {
  await opts.filesystem.vfs.readBytes(CUSTOM_DEFS_FILE);
  const [
    { CustomExecutorHost },
    { CustomIntegrationManager },
    { CustomIntegrationProvider },
    { RemoteCustomSecretStore },
    { FileCustomIntegrationStore },
  ] = await Promise.all([
    import("@houston/host/src/integrations/custom/executor-host"),
    import("@houston/host/src/integrations/custom/manager"),
    import("@houston/host/src/integrations/custom/provider"),
    import("@houston/host/src/integrations/custom/secrets"),
    import("@houston/host/src/integrations/custom/store"),
  ]);
  const store = new FileCustomIntegrationStore(
    join(opts.filesystem.storeRoot, CUSTOM_DEFS_FILE),
  );
  const secrets = new RemoteCustomSecretStore({
    baseUrl: opts.grantUrl,
    orgSlug: opts.orgSlug,
    agentSlug: opts.agentSlug,
    podToken: opts.hostToken,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  const executor = new CustomExecutorHost(secrets, () => store.list());
  const manager = new CustomIntegrationManager(
    store,
    secrets,
    executor,
    () => undefined,
    {},
  );
  return {
    manager,
    provider: new CustomIntegrationProvider(store, executor),
    dispose: () => executor.reset(),
  };
}

/** Store-relative custom-integration definitions document. */
export const customDefinitionsFile = CUSTOM_DEFS_FILE;
