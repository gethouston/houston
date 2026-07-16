/**
 * The host's pre-agent connect surface (`/setup-runtime/*`) — what the WebApp
 * connect gate and ConnectView speak BEFORE any agent exists. Mirrors
 * `packages/host/src/routes/setup-runtime.ts`: only the connect surface is
 * exposed (providers, auth status, login/complete/cancel, credential capture /
 * api-key / claude-oauth); anything else under the prefix is a 404, exactly
 * like the real host. Backed by the same {@link state.FLAT_KEY} slot the old
 * flat routes used, so the seed (Claude connected + active) clears the gate.
 */

import { parseClaudeOAuthEnvelope } from "@houston/protocol";
import type { ProviderId } from "@houston/runtime-client";
import { json } from "./http";
import * as state from "./state";

const PREFIX = "/setup-runtime";
const LOGIN = /^auth\/([^/]+)\/login(?:\/(complete|cancel))?$/;

/** Handle a `/setup-runtime/*` request; null when the path isn't ours. */
export function handleSetupRuntime(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | undefined,
): Response | null {
  if (path !== PREFIX && !path.startsWith(`${PREFIX}/`)) return null;
  const rest = path.slice(`${PREFIX}/`.length);

  if (method === "GET" && rest === "providers")
    return json(state.providerList(state.FLAT_KEY));
  if (method === "GET" && rest === "auth/status")
    return json(state.authStatusFor(state.FLAT_KEY));

  // Connect-once capture: the real host pulls the setup runtime's credential
  // into the workspace-central store. Here: mark the provider connected.
  if (method === "POST" && rest === "credential/capture") {
    const provider = (
      typeof body?.provider === "string" ? body.provider : "anthropic"
    ) as ProviderId;
    state.completeLogin(state.FLAT_KEY, provider);
    return json({ ok: true, provider });
  }

  if (method === "POST" && rest === "credential/api-key") {
    const provider = body?.provider;
    if (!provider || typeof provider !== "string")
      return json({ error: "missing 'provider'" }, 400);
    if (!body?.apiKey || typeof body.apiKey !== "string")
      return json({ error: "missing 'apiKey'" }, 400);
    state.setApiKey(state.FLAT_KEY, provider as ProviderId);
    return json({ ok: true });
  }

  // Same validation as the real route: a malformed envelope is a clean 400.
  if (method === "POST" && rest === "credential/claude-oauth") {
    const parsed = parseClaudeOAuthEnvelope(body ?? {});
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    state.completeLogin(state.FLAT_KEY, "anthropic");
    return json({ ok: true });
  }

  const login = method === "POST" ? LOGIN.exec(rest) : null;
  if (login) {
    const provider = login[1] as ProviderId;
    if (login[2] === "complete") {
      state.completeLogin(state.FLAT_KEY, provider);
      return json({ ok: true });
    }
    if (login[2] === "cancel") {
      state.cancelLogin(state.FLAT_KEY, provider);
      return json({ ok: true });
    }
    const enterpriseDomain =
      url.searchParams.get("enterpriseDomain") ?? undefined;
    return json(state.startLogin(state.FLAT_KEY, provider, enterpriseDomain));
  }

  return json({ error: "not found" }, 404);
}
