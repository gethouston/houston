/**
 * The per-agent runtime proxy under `/agents/:id/*` for the fake host: the
 * API-key credential write, provider auth, and the conversation stream
 * (packages/runtime-client/src/client.ts).
 */

import { parseMentions } from "@houston/protocol";
import type { ProviderId } from "@houston/runtime-client";
import { cancelChat, openChatStream, sendMessage } from "./chat";
import { json, noContent } from "./http";
import { apiKeyProviderSpec } from "./provider-catalog";
import { planMessageRefusal } from "./routes-plan";
import * as state from "./state";

export function handleCredential(
  method: string,
  id: string,
  rest: string[],
  body: Record<string, unknown> | undefined,
): Response {
  // `POST /agents/:id/credential/api-key` is the ONLY write an API-key
  // connect makes — the real host stores the key centrally AND pushes it
  // into the standing runtime, so `/providers` reads connected at once. No
  // runtime-side call follows it, so accepting it as a no-op left the
  // provider unconnected while the dialog reported success. Same gate as
  // the real route: the provider must be one this catalog connects with a
  // pasted key (an OAuth or unknown id is "unknown API-key provider"), and
  // a key that is only whitespace is no key.
  if (method === "POST" && rest[2] === "api-key") {
    const spec = apiKeyProviderSpec(body?.provider);
    if (!spec) return json({ error: "unknown API-key provider" }, 400);
    const key = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    if (!key) return json({ error: "missing 'apiKey'" }, 400);
    state.setApiKey(id, spec.id);
    return json({ ok: true, provider: spec.id });
  }
  // capture / forget: each is paired with a runtime login/logout call the
  // fake already models, so the slot state is carried there.
  return noContent();
}

export function handleAuth(id: string, rest: string[], req: Request): Response {
  if (rest[2] === "status") return json(state.authStatusFor(id));
  const provider = rest[2] as ProviderId; // /auth/:provider/...
  const action = rest[3];
  if (action === "login" && rest[4] === "complete") {
    state.completeLogin(id, provider);
    return json({ ok: true });
  }
  if (action === "login" && rest[4] === "cancel") {
    state.cancelLogin(id, provider);
    return json({ ok: true });
  }
  if (action === "login") {
    const enterpriseDomain =
      new URL(req.url).searchParams.get("enterpriseDomain") ?? undefined;
    return json(state.startLogin(id, provider, enterpriseDomain));
  }
  if (action === "api-key") {
    state.setApiKey(id, provider);
    return json({ ok: true });
  }
  if (action === "logout") {
    state.logout(id, provider);
    return json({ ok: true });
  }
  return noContent();
}

export function handleConversations(
  method: string,
  id: string,
  rest: string[],
  req: Request,
  body: Record<string, unknown> | undefined,
): Response | Promise<Response> {
  const cid = rest[2];
  const action = rest[3];
  if (action === "events") return openChatStream(req, id, cid);
  if (action === "messages") {
    if (method === "GET")
      return json({
        id: cid,
        title: "",
        messages: state.getHistory(id, cid),
      });
    if (method === "POST")
      // An armed C19 weekly limit refuses the turn at the gateway, before it
      // ever reaches the runtime.
      return (
        planMessageRefusal() ??
        sendMessage(
          id,
          cid,
          String(body?.text ?? ""),
          typeof body?.nonce === "string" ? body.nonce : undefined,
          typeof body?.displayText === "string" ? body.displayText : undefined,
          // The @mention sidecar, through the SAME wire guard the real send
          // routes use — the mock can't drift on what a mention is.
          parseMentions(body?.mentions),
        )
      );
  }
  if (action === "cancel") {
    // `cancelled` mirrors the runtime: false = nothing was in flight, so
    // the client settles the stuck card itself (the orphan path).
    return json({ ok: true, cancelled: cancelChat(id, cid) });
  }
  if (action === "mode" && method === "POST") {
    // Live Mode-pill switch passthrough. No turn ever runs in the fake
    // host, so it always answers the benign "nothing to apply" shape.
    return json({ ok: true, applied: false });
  }
  if (action === "truncate" && method === "POST") {
    // Edit-and-resend rewind (PRODUCT-1217): cut the transcript at the
    // named user turn. No turn ever runs in the fake host, so the real
    // route's 409-while-running never applies here.
    const turnId = typeof body?.turnId === "string" ? body.turnId : "";
    if (!state.truncateHistory(id, cid, turnId))
      return json({ error: "turn not found" }, 404);
    return json({ ok: true, removed: 0 });
  }
  if (action === "dismiss-interaction" && method === "POST") {
    // Runtime passthrough: append the durable stop marker to the transcript
    // AND retire the bound activity's pending interaction (mirrors the real
    // dismiss). No turn runs in the fake host, so always the success path —
    // the real host's 409-while-running never applies here.
    state.appendStoppedMessage(id, cid);
    state.clearActivityInteraction(id, cid);
    return json({ ok: true });
  }
  return noContent();
}
