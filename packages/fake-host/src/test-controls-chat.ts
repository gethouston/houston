import type { ChatMessage, PendingInteraction } from "@houston/protocol";
import {
  armHoldAfterFirstDelta,
  setNextInteraction,
  setNextReplyText,
  setReplyDelay,
} from "./chat";
import {
  clearChatStreams,
  dropChatStreams,
  killRunningTurns,
  turnBoundary,
} from "./chat-controls";
import { type ScriptedToolCall, setNextToolCalls } from "./chat-tools";
import { SEED_AGENT_ID } from "./config";
import { json, parseBody } from "./http";
import { lastPortableExport, resetPortable } from "./routes-portable";
import { setSwitchDeclines } from "./routes-price-notice";
import { setSeatChargeResult } from "./routes-seats";
import { resetUploads } from "./routes-uploads";
import * as state from "./state";

export async function handleChatControls(
  req: Request,
): Promise<Response | undefined> {
  const path = new URL(req.url).pathname;
  const method = req.method;
  if (path === "/__test__/reset" && method === "POST") {
    clearChatStreams();
    resetPortable();
    resetUploads();
    state.reset();
    state.setYearlySold(true);
    setSwitchDeclines(false);
    setSeatChargeResult("ok");
    return json({ ok: true });
  }
  if (path === "/__test__/seat-charge" && method === "POST") {
    const body = await parseBody(req);
    setSeatChargeResult(
      body?.result === "decline" || body?.result === "needs_action"
        ? body.result
        : "ok",
    );
    return json({ ok: true });
  }
  if (path === "/__test__/switch-yearly" && method === "POST") {
    const body = await parseBody(req);
    setSwitchDeclines(body?.decline === true);
    return json({ ok: true });
  }
  if (path === "/__test__/yearly" && method === "POST") {
    const body = await parseBody(req);
    state.setYearlySold(body?.sold !== false);
    return json({ ok: true });
  }
  if (path === "/__test__/portable-export" && method === "GET") {
    return json({ selection: lastPortableExport() });
  }
  if (path === "/__test__/emit" && method === "POST") {
    const body = await parseBody(req);
    state.emit(
      String(body?.type ?? "AgentsChanged"),
      body?.agentPath as string | undefined,
    );
    return json({ ok: true });
  }
  if (path === "/__test__/drop-chat-streams" && method === "POST") {
    return json({ dropped: dropChatStreams() });
  }
  if (path === "/__test__/chat-config" && method === "POST") {
    const body = await parseBody(req);
    setReplyDelay(Number(body?.replyDelayMs ?? 15));
    armHoldAfterFirstDelta(body?.holdAfterFirstDelta === true);
    return json({ ok: true });
  }
  if (path === "/__test__/chat-reply" && method === "POST") {
    const body = await parseBody(req);
    setNextReplyText(typeof body?.text === "string" ? body.text : null);
    return json({ ok: true });
  }
  if (path === "/__test__/chat-tools" && method === "POST") {
    const body = await parseBody(req);
    setNextToolCalls(
      Array.isArray(body?.calls) ? (body.calls as ScriptedToolCall[]) : [],
    );
    return json({ ok: true });
  }
  if (path === "/__test__/chat-interaction" && method === "POST") {
    const body = await parseBody(req);
    setNextInteraction(
      (body?.interaction as PendingInteraction | null) ?? null,
    );
    return json({ ok: true });
  }
  if (path === "/__test__/chat-history" && method === "POST") {
    const body = await parseBody(req);
    const messages = Array.isArray(body?.messages)
      ? (body.messages as ChatMessage[])
      : [];
    return json({
      messages: state.seedHistory(
        typeof body?.agentId === "string" ? body.agentId : SEED_AGENT_ID,
        String(body?.conversationId ?? ""),
        messages,
      ),
    });
  }
  if (path === "/__test__/kill-turn" && method === "POST") {
    return json({ killed: killRunningTurns() });
  }
  if (path === "/__test__/turn-boundary" && method === "POST") {
    const body = await parseBody(req);
    return json({
      advanced: turnBoundary(String(body?.nextText ?? "next turn")),
    });
  }
  return undefined;
}
