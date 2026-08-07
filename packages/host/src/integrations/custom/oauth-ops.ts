import type { CustomExecutorHost } from "./executor-host";
import { TOKEN_VARIABLE } from "./executor-host";
import { parseBundle } from "./oauth-bundle";
import {
  beginCustomOAuth,
  type CustomOAuthAttempts,
  settleCustomOAuth,
} from "./oauth-flow";
import { type CustomSecretStore, secretIdFor } from "./secrets";
import type { CustomIntegrationStore } from "./store";
import type { CustomIntegrationDef, CustomIntegrationView } from "./types";
import { CustomIntegrationError } from "./types";
import { viewOf } from "./views";

/**
 * The manager-side OAuth operations (PRODUCT-1172), split out so the manager
 * stays a thin serializer. `start` mints the authorize URL (in-memory attempt
 * only — nothing durable moves before the exchange); `complete` is the
 * callback's landing: exchange the code, persist the token bundle under the
 * SAME secret id a pasted key would use, and rewire the connection through
 * the proven setCredential sequence.
 */
export interface CustomOAuthDeps {
  store: CustomIntegrationStore;
  secrets: CustomSecretStore;
  host: CustomExecutorHost;
  attempts: CustomOAuthAttempts;
  /** The browser-reachable callback URL; absent = this deployment cannot
   *  receive the redirect (managed cloud until its gateway route ships). */
  callbackUrl?: string;
  fetchFn?: typeof fetch;
  onChanged: () => void;
}

export async function startOAuthOp(
  deps: CustomOAuthDeps,
  def: CustomIntegrationDef,
): Promise<{ authorizeUrl: string }> {
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
  // The stored bundle is only an OPTIMIZATION here (reuse the registered
  // client on a re-auth) — a custody hiccup must not kill the START; the
  // flow simply registers fresh. Completion still fails loudly if the store
  // cannot take the tokens.
  const raw = await deps.secrets
    .get(secretIdFor(def.slug, TOKEN_VARIABLE))
    .catch(() => null);
  const existing = raw ? parseBundle(raw) : null;
  const { state, authorizeUrl, attempt } = await beginCustomOAuth(
    def,
    deps.callbackUrl,
    existing,
    deps.fetchFn,
  );
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
  const def = await defOf(attempt.slug);
  // The attempt binds to the SERVICE, not just the slug: a replace that moved
  // the slug to a different endpoint mid-flow must not receive the old
  // service's tokens (the executor would then send them to the new host).
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
  const liveState = {
    status: "active" as const,
    toolCount: await deps.host.toolCount(executor, def.slug),
  };
  states.set(def.slug, liveState);
  deps.onChanged();
  return viewOf(updated, liveState, methods);
}
