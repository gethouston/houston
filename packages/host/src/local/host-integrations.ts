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
  // Integrations (platform model): the desktop holds NO provider key — the
  // gateway adapter forwards every call to Houston's cloud host with the user's
  // Supabase session (kept fresh by the frontend via PUT /v1/integrations/
  // session). Self-host/dev goes direct with its own COMPOSIO_API_KEY instead.
  // A leftover `integrations.json` from the retired "Composio for you" model
  // means this user's old connections are gone — surface the one-time
  // reconnect notice (their personal long-lived key is no longer used: a
  // security improvement, and the UI says so). Dismissing it DELETES the file
  // (it still holds that retired plaintext key), which also clears the flag —
  // active() re-checks the disk on every status read, no restart needed.
  // Gateway wins when both are configured: a machine that CAN forward to the
  // key's real custodian should, and it makes dev's prod-simulation a one-knob
  // toggle (drop the URL from .env.local → direct mode with your own key).
  const sessionToken = { current: null as string | null };
  const legacyIntegrationsPath = join(
    dirname(opts.credentialsPath),
    "integrations.json",
  );
  // The DIRECT Composio adapter (self-host / dev with an own key). Only when NOT
  // in gateway mode (gatewayUrl wins), where the desktop forwards to Houston's
  // cloud host with the user's Supabase session instead.
  const directProvider =
    opts.integrations?.composioApiKey && !opts.integrations?.gatewayUrl
      ? new ComposioProvider({ apiKey: opts.integrations.composioApiKey })
      : undefined;
  const composioProvider = opts.integrations?.gatewayUrl
    ? new RemoteIntegrationProvider({
        id: "composio",
        upstreamUrl: opts.integrations.gatewayUrl,
        token: () => sessionToken.current,
        // Managed pods pass their host token so routine turns authenticate as
        // the creator; the desktop leaves this undefined.
        podToken: opts.integrations.podToken,
      })
    : (directProvider ?? null);

  // Custom integrations (HOU-550): user-added API/MCP sources compiled to
  // agent tools by the embedded executor engine. Key-free and session-free —
  // definitions + secrets live on THIS host's disk — so the provider is wired
  // unconditionally: an install with no Composio at all can still add its own.
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
  // OAuth sign-in for custom MCP servers (PRODUCT-1172): only a deployment
  // whose callback a browser can actually reach offers it. The desktop
  // sidecar (local profile, loopback bind) derives its own base; self-host
  // opts in with an explicit public origin; managed pods stay off until the
  // gateway serves a callback.
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
          // A gateway-fronted pod's callback is the GATEWAY's public route:
          // the browser lands there, and the gateway routes it to this pod by
          // the `<org>.<agent>.` prefix minted into the state. Loopback bases
          // (desktop, dev engines) land on this host directly and need none —
          // but carrying it is harmless, so it rides whenever the pod knows
          // its coordinates.
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
      // force: already-gone is success (idempotent dismiss); a real
      // failure (EACCES…) throws and surfaces as the route's error.
      dismiss: () => rmSync(legacyIntegrationsPath, { force: true }),
    },
  };

  return { registry, integrations, customIntegrations, remoteCustomSecrets };
}
