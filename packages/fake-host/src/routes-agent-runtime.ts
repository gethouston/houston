import {
  CONVERSATION_IMPORT_INVALID,
  parseConversationImportRequest,
  parseMentions,
} from "@houston/protocol";
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
  if (method === "POST" && rest[2] === "api-key") {
    const spec = apiKeyProviderSpec(body?.provider);
    if (!spec) return json({ error: "unknown API-key provider" }, 400);
    const key = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    if (!key) return json({ error: "missing 'apiKey'" }, 400);
    state.setApiKey(id, spec.id);
    return json({ ok: true, provider: spec.id });
  }
  return noContent();
}

export function handleAuth(id: string, rest: string[], req: Request): Response {
  if (rest[2] === "status") return json(state.authStatusFor(id));
  const provider = rest[2] as ProviderId;
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
      return (
        planMessageRefusal() ??
        sendMessage(
          id,
          cid,
          String(body?.text ?? ""),
          typeof body?.nonce === "string" ? body.nonce : undefined,
          typeof body?.displayText === "string" ? body.displayText : undefined,
          parseMentions(body?.mentions),
        )
      );
  }
  if (action === "cancel") {
    return json({ ok: true, cancelled: cancelChat(id, cid) });
  }
  if (action === "mode" && method === "POST") {
    return json({ ok: true, applied: false });
  }
  if (action === "truncate" && method === "POST") {
    const turnId = typeof body?.turnId === "string" ? body.turnId : "";
    if (!state.truncateHistory(id, cid, turnId))
      return json({ error: "turn not found" }, 404);
    return json({ ok: true, removed: 0 });
  }
  if (action === "import" && method === "POST") {
    const request = parseConversationImportRequest(body);
    if (!request)
      return json(
        {
          error: "not a conversation import",
          code: CONVERSATION_IMPORT_INVALID,
        },
        400,
      );
    const hold = state.arming.importHold;
    if (hold)
      return hold.released.then(() =>
        json({ ok: true, imported: state.importHistory(id, cid, request) }),
      );
    return json({ ok: true, imported: state.importHistory(id, cid, request) });
  }
  if (action === "dismiss-interaction" && method === "POST") {
    state.appendStoppedMessage(id, cid);
    state.clearActivityInteraction(id, cid);
    return json({ ok: true });
  }
  return noContent();
}
