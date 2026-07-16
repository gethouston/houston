/**
 * The host's pre-agent connect surface (`/setup-runtime/*`) — mirrors
 * packages/host/src/routes/setup-runtime.ts. Two consumers with OPPOSITE needs
 * share this prefix in the harness, so it deliberately splits its slots:
 *
 *  - `auth/status` (the WebApp boot gate, packages/web/src/new-engine/app.tsx)
 *    reads the CONNECTED {@link state.FLAT_KEY} slot — anthropic active, so the
 *    gate clears and every spec reaches the shell instead of ConnectView.
 *  - `providers` (onboarding's connect step, reached pre-agent through
 *    `setupRuntimeClientFor`) reads the EMPTY {@link state.SETUP_KEY} slot —
 *    first-run truth, every provider renders a Connect pill
 *    (onboarding-connect.spec).
 *
 * Connect mutations (login complete, api-key) flip BOTH slots: on the real host
 * a setup-runtime capture lands on the personal workspace, so the credential is
 * visible everywhere afterward.
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
  const sub = rest.join("/");

  if (method === "GET") {
    if (sub === "auth/status") return json(state.authStatusFor(state.FLAT_KEY));
    if (sub === "providers") return json(state.providerList(state.SETUP_KEY));
  }

  if (method === "POST") {
    // Connect-once credential pushes: api-key flips both slots connected (the
    // real host pushes into the setup runtime so `auth/status` reads connected
    // immediately); capture + claude-oauth are accepted acks.
    if (sub === "credential/api-key") {
      const provider = String(body?.provider ?? "") as ProviderId;
      state.setApiKey(state.FLAT_KEY, provider);
      state.setApiKey(state.SETUP_KEY, provider);
      return json({ ok: true });
    }
    if (sub === "credential/capture" || sub === "credential/claude-oauth")
      return json({ ok: true });

    // OAuth login chain: /auth/:provider/login[/complete|/cancel]. Mutations
    // land on both slots so the login poll (auth/status) and the connect list
    // (providers) tell the same story.
    if (rest[0] === "auth" && rest[2] === "login") {
      const provider = rest[1] as ProviderId;
      if (rest[3] === "complete") {
        state.completeLogin(state.FLAT_KEY, provider);
        state.completeLogin(state.SETUP_KEY, provider);
        return json({ ok: true });
      }
      if (rest[3] === "cancel") {
        state.cancelLogin(state.FLAT_KEY, provider);
        state.cancelLogin(state.SETUP_KEY, provider);
        return json({ ok: true });
      }
      if (rest.length === 3) {
        const enterpriseDomain =
          new URL(req.url).searchParams.get("enterpriseDomain") ?? undefined;
        state.startLogin(state.SETUP_KEY, provider, enterpriseDomain);
        return json(
          state.startLogin(state.FLAT_KEY, provider, enterpriseDomain),
        );
      }
    }
  }

  // Everything else stays agent-scoped on the real host — 404, same as it.
  return json({ error: "not found" }, 404);
}
