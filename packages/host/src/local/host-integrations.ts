import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { LOCAL_CAPABILITIES } from "../capabilities";
import type { BusEventHub } from "../events/hub";
import { ComposioProvider } from "../integrations/composio";
import { CustomExecutorHost } from "../integrations/custom/executor-host";
import { CustomIntegrationManager } from "../integrations/custom/manager";
import { CustomIntegrationProvider } from "../integrations/custom/provider";
import {
  FileCustomSecretStore,
  RemoteCustomSecretStore,
} from "../integrations/custom/secrets";
import { FileCustomIntegrationStore } from "../integrations/custom/store";
import { IntegrationRegistry } from "../integrations/registry";
import { RemoteIntegrationProvider } from "../integrations/remote";
import { CUSTOM_OAUTH_CALLBACK_PATH } from "../routes/custom-integrations-oauth";
import { LOCAL_USER } from "./host-log";
import type { LocalHostOptions } from "./host-options";

export function createHostIntegrations(
  opts: LocalHostOptions,
  events: BusEventHub,
) {
  const sessionToken = { current: null as string | null };
  const legacyIntegrationsPath = join(
    dirname(opts.credentialsPath),
    "integrations.json",
  );
  const directProvider =
    opts.integrations?.composioApiKey && !opts.integrations?.gatewayUrl
      ? new ComposioProvider({ apiKey: opts.integrations.composioApiKey })
      : undefined;
  const composioProvider = opts.integrations?.gatewayUrl
    ? new RemoteIntegrationProvider({
        id: "composio",
        upstreamUrl: opts.integrations.gatewayUrl,
        token: () => sessionToken.current,
        podToken: opts.integrations.podToken,
      })
    : (directProvider ?? null);

  const customDir = dirname(opts.credentialsPath);
  const customStore = new FileCustomIntegrationStore(
    join(customDir, "custom-integrations.json"),
  );
  const legacyCustomSecrets = new FileCustomSecretStore(
    join(customDir, "custom-integration-secrets.json"),
  );
  const remoteCustomSecrets = opts.credentials
    ? new RemoteCustomSecretStore({
        baseUrl: opts.credentials.url,
        orgSlug: opts.credentials.orgSlug,
        agentSlug: opts.credentials.agentSlug,
        podToken: opts.credentials.podToken,
        legacy: legacyCustomSecrets,
      })
    : undefined;
  const customSecrets = remoteCustomSecrets ?? legacyCustomSecrets;
  const customExecutor = new CustomExecutorHost(customSecrets, () =>
    customStore.list(),
  );
  const customProvider = new CustomIntegrationProvider(
    customStore,
    customExecutor,
  );
  const oauthCallbackBase =
    opts.oauthCallbackBase ??
    ((opts.capabilities ?? LOCAL_CAPABILITIES).profile === "local" &&
    (opts.bind ?? "127.0.0.1") === "127.0.0.1"
      ? `http://127.0.0.1:${opts.port}`
      : undefined);
  const customIntegrations = new CustomIntegrationManager(
    customStore,
    customSecrets,
    customExecutor,
    () => events.emit(LOCAL_USER, { type: "CustomIntegrationsChanged" }),
    oauthCallbackBase
      ? {
          callbackUrl: `${oauthCallbackBase.replace(/\/+$/, "")}${CUSTOM_OAUTH_CALLBACK_PATH}`,
          ...(opts.credentials
            ? {
                statePrefix: `${opts.credentials.orgSlug}.${opts.credentials.agentSlug}`,
              }
            : {}),
        }
      : {},
  );

  const registry = new IntegrationRegistry([
    ...(composioProvider ? [composioProvider] : []),
    customProvider,
  ]);
  const integrations = {
    registry,
    ...(opts.integrations?.gatewayUrl
      ? {
          session: {
            set: (token: string | null) => {
              sessionToken.current = token;
            },
          },
        }
      : {}),
    reconnectNotice: {
      active: () => existsSync(legacyIntegrationsPath),
      dismiss: () => rmSync(legacyIntegrationsPath, { force: true }),
    },
  };

  return { registry, integrations, customIntegrations, remoteCustomSecrets };
}
