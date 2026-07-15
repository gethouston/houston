/**
 * The host's pre-agent connect surface (`/setup-runtime/*`) — mirrors
 * packages/host/src/routes/setup-runtime.ts. The WebApp's connect gate and the
 * ConnectView probe `auth/status` HERE (the real host serves no flat
 * `/auth/status`), and first-run onboarding runs its provider login through the
 * same prefix. Backed by the SAME {@link state.FLAT_KEY} slot as the legacy
 * top-level probes, so a login completed either way reads connected on both.
 */

import type { ProviderId } from "@houston/runtime-client";
import { json } from "./http";
import * as state from "./state";

/** Dispatch `/setup-runtime/...`. `rest` is the path split AFTER the prefix. */
export function handleSetupRuntime(
  method: string,
  rest: string[],
  req: Request,
  body: Record<string, unknown> | undefined,
): Response {
  const key = state.FLAT_KEY;
  const sub = rest.join("/");

  if (method === "GET") {
    if (sub === "auth/status") return json(state.authStatusFor(key));
    if (sub === "providers") return json(state.providerList(key));
  }

  if (method === "POST") {
    // Connect-once credential pushes: api-key flips the slot connected (the
    // real host pushes into the setup runtime so `auth/status` reads connected
    // immediately); capture + claude-oauth are accepted acks.
    if (sub === "credential/api-key") {
      state.setApiKey(key, String(body?.provider ?? "") as ProviderId);
      return json({ ok: true });
    }
    if (sub === "credential/capture" || sub === "credential/claude-oauth")
      return json({ ok: true });

    // OAuth login chain: /auth/:provider/login[/complete|/cancel].
    if (rest[0] === "auth" && rest[2] === "login") {
      const provider = rest[1] as ProviderId;
      if (rest[3] === "complete") {
        state.completeLogin(key, provider);
        return json({ ok: true });
      }
      if (rest[3] === "cancel") {
        state.cancelLogin(key, provider);
        return json({ ok: true });
      }
      if (rest.length === 3) {
        const enterpriseDomain =
          new URL(req.url).searchParams.get("enterpriseDomain") ?? undefined;
        return json(state.startLogin(key, provider, enterpriseDomain));
      }
    }
  }

  // Everything else stays agent-scoped on the real host — 404, same as it.
  return json({ error: "not found" }, 404);
}
