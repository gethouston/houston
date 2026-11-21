import type { CustomExecutorHost } from "./executor-host";
import { TOKEN_VARIABLE } from "./executor-host";
import type { CustomOAuthAttempts } from "./oauth-attempts";
import { parseBundle } from "./oauth-bundle";
import {
  beginCustomOAuth,
  type CustomOAuthAttempt,
  settleCustomOAuth,
} from "./oauth-flow";
import { type CustomSecretStore, secretIdFor } from "./secrets";
import type { CustomIntegrationStore } from "./store";
import type { CustomIntegrationDef, CustomIntegrationView } from "./types";
import { CustomIntegrationError } from "./types";
import { viewOf } from "./views";

export interface CustomOAuthDeps {
  store: CustomIntegrationStore;
  secrets: CustomSecretStore;
  host: CustomExecutorHost;
  attempts: CustomOAuthAttempts;
  callbackUrl?: string;
  statePrefix?: string;
  fetchFn?: typeof fetch;
  onChanged: (slug: string) => void;
}

export async function prepareOAuthOp(
  deps: CustomOAuthDeps,
  def: CustomIntegrationDef,
): Promise<{
  authorizeUrl: string;
  state: string;
  attempt: CustomOAuthAttempt;
}> {
  if (!deps.callbackUrl) {
    throw new CustomIntegrationError(
      "oauth_unsupported",
      "signing in with this service is not available on this Houston deployment yet",
    );
  }
  if (def.kind !== "mcp") {
    throw new CustomIntegrationError(
      "oauth_unsupported",
      `'${def.slug}' is not an MCP server - only MCP servers offer their own sign-in`,
    );
  }
  const raw = await deps.secrets
    .get(secretIdFor(def.slug, TOKEN_VARIABLE))
    .catch(() => null);
  const existing = raw ? parseBundle(raw) : null;
  const { state, authorizeUrl, attempt } = await beginCustomOAuth(
    def,
    deps.callbackUrl,
    existing,
    {
      ...(deps.fetchFn ? { fetchFn: deps.fetchFn } : {}),
      ...(deps.statePrefix ? { statePrefix: deps.statePrefix } : {}),
    },
  );
  return { authorizeUrl, state, attempt };
}

export async function startOAuthOp(
  deps: CustomOAuthDeps,
  def: CustomIntegrationDef,
): Promise<{ authorizeUrl: string }> {
  const { authorizeUrl, state, attempt } = await prepareOAuthOp(deps, def);
  deps.attempts.put(state, attempt);
  return { authorizeUrl };
}

export async function completeOAuthOp(
  deps: CustomOAuthDeps,
  defOf: (slug: string) => Promise<CustomIntegrationDef>,
  state: string,
  code: string,
): Promise<CustomIntegrationView> {
  const attempt = deps.attempts.take(state);
  if (!attempt) {
    throw new CustomIntegrationError(
      "oauth_state_invalid",
      "this sign-in link has expired or was already used - start again from the integration's card",
    );
  }
  return completeOAuthWithAttempt(deps, defOf, attempt, code);
}

export async function completeOAuthWithAttempt(
  deps: CustomOAuthDeps,
  defOf: (slug: string) => Promise<CustomIntegrationDef>,
  attempt: CustomOAuthAttempt,
  code: string,
): Promise<CustomIntegrationView> {
  const def = await defOf(attempt.slug);
  if (def.kind !== "mcp" || def.endpoint !== attempt.endpoint) {
    throw new CustomIntegrationError(
      "oauth_state_invalid",
      "this integration changed while the sign-in was in progress - start again from its card",
    );
  }
  const bundle = await settleCustomOAuth(attempt, code, deps.fetchFn);
  const { executor, states } = await deps.host.ensure();
  const methods = await deps.host.authMethods(executor, def.slug);
  const template = methods[0]?.template;
  if (!template) {
    const live = states.get(def.slug);
    throw new CustomIntegrationError(
      "oauth_failed",
      live?.status === "error"
        ? `'${def.slug}' is not working right now (${live.message})`
        : `'${def.slug}' has no way to carry the sign-in token`,
    );
  }
  const secretId = secretIdFor(def.slug, TOKEN_VARIABLE);
  await deps.secrets.set(secretId, JSON.stringify(bundle));
  const credential = { template, secretIds: { [TOKEN_VARIABLE]: secretId } };
  const updated: CustomIntegrationDef = { ...def, auth: "oauth", credential };
  await deps.store.put(updated);
  await deps.host.reconnect(executor, def.slug, credential);
  const liveState = await deps.host.connectedState(executor, updated);
  states.set(def.slug, liveState);
  deps.onChanged(def.slug);
  return viewOf(updated, liveState, methods);
}
