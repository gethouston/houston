import { join } from "node:path";
import type { CustomIntegrationManager } from "@houston/host/src/integrations/custom/manager";
import type { CustomIntegrationProvider } from "@houston/host/src/integrations/custom/provider";
import { preloadCustomIntegrationModules } from "./custom-integration-loader";
import type { TurnFilesystem } from "./turn-filesystem";

const CUSTOM_DEFS_FILE = "custom-integrations.json";

export interface TurnCustomContext {
  manager: CustomIntegrationManager;
  provider: CustomIntegrationProvider;
  dispose: () => Promise<void>;
}

export async function createTurnCustomContext(opts: {
  filesystem: TurnFilesystem;
  grantUrl: string;
  hostToken: string;
  orgSlug: string;
  agentSlug: string;
  fetchImpl?: typeof fetch;
  onChanged?: (slug: string) => void;
}): Promise<TurnCustomContext> {
  await opts.filesystem.vfs.readBytes(CUSTOM_DEFS_FILE);
  const [
    { CustomExecutorHost },
    { CustomIntegrationManager },
    { CustomIntegrationProvider },
    { RemoteCustomSecretStore },
    { FileCustomIntegrationStore },
  ] = await preloadCustomIntegrationModules();
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
    opts.onChanged ?? (() => undefined),
    {},
  );
  return {
    manager,
    provider: new CustomIntegrationProvider(store, executor),
    dispose: () => executor.reset(),
  };
}

export const customDefinitionsFile = CUSTOM_DEFS_FILE;
