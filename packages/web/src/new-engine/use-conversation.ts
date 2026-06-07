import { useCallback, useEffect, useRef, useState } from "react";
import {
  EngineError,
  type ChatMessage,
  type HoustonEngineClient,
  type WireEvent,
} from "@houston/engine-client";

export type Msg = ChatMessage & { streaming?: boolean };

/** A fresh, collision-proof conversation or message id. */
export function uuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const is404 = (e: unknown) => e instanceof EngineError && e.status === 404;
const isAbort = (e: unknown) => e instanceof Error && e.name === "AbortError";

/** Extend the in-flight assistant bubble, or start one if none is streaming. */
function withAssistantDelta(msgs: Msg[], delta: string): Msg[] {
  const last = msgs[msgs.length - 1];
  if (last?.role === "assistant" && last.streaming) {
    const out = msgs.slice();
    out[out.length - 1] = { ...last, content: last.content + delta };
    return out;
  }
  return [...msgs, { role: "assistant", content: delta, ts: Date.now(), streaming: true }];
}

const stopStreaming = (msgs: Msg[]): Msg[] =>
  msgs.map((m) => (m.streaming ? { ...m, streaming: false } : m));

/**
 * Drive ONE conversation: its history baseline + its live, id-scoped event
 * stream. Switching `conversationId` tears down the previous stream (abort) and
 * starts the new one, so events from one chat can never render into another.
 */
export function useConversation(client: HoustonEngineClient, conversationId: string) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Nonces this client sent — used to drop our own `user` echo from the stream.
  const ownNonces = useRef<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    const ac = new AbortController();
    ownNonces.current = new Set();
    setMessages([]);
    setBusy(false);
    setError(null);

    const apply = (ev: WireEvent) => {
      if (!live) return;
      switch (ev.type) {
        case "sync":
          setBusy(ev.data.running);
          if (ev.data.running && ev.data.partial)
            setMessages((m) => withAssistantDelta(m, ev.data.partial));
          break;
        case "user":
          if (ev.data.nonce && ownNonces.current.has(ev.data.nonce)) break;
          setMessages((m) => [
            ...m,
            { role: "user", content: ev.data.content, ts: ev.data.ts },
          ]);
          break;
        case "text":
          setBusy(true);
          setMessages((m) => withAssistantDelta(m, ev.data));
          break;
        case "tool_start":
          setMessages((m) => withAssistantDelta(m, `\n🔧 ${ev.data.name}\n`));
          break;
        case "error":
          setMessages((m) => stopStreaming(withAssistantDelta(m, `\n⚠️ ${ev.data.message}`)));
          setBusy(false);
          break;
        case "done":
          setMessages(stopStreaming);
          setBusy(false);
          break;
        default:
          break; // thinking, tool_end — recorded server-side, not shown here
      }
    };

    // Load history FIRST, then open the stream — so a `sync`/delta for an
    // in-flight turn (on reconnect) applies on top of the baseline instead of
    // racing it (a late history fetch would otherwise clobber streamed text).
    void (async () => {
      try {
        const h = await client.getHistory(conversationId);
        if (live) setMessages(h.messages);
      } catch (e) {
        // 404 = a brand-new conversation with no messages yet → leave empty.
        if (live && !is404(e)) setError(errText(e));
      }
      if (!live) return;
      try {
        await client.streamEvents(conversationId, { signal: ac.signal, onEvent: apply });
      } catch (e) {
        if (live && !isAbort(e)) setError(errText(e));
      }
    })();

    return () => {
      live = false;
      ac.abort();
    };
  }, [client, conversationId]);

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      const nonce = uuid();
      ownNonces.current.add(nonce);
      setError(null);
      setBusy(true);
      // Optimistic: show our message + an empty streaming bubble immediately. The
      // server's `user` echo carries our nonce, so we skip rendering it twice.
      setMessages((m) => [
        ...m,
        { role: "user", content: t, ts: Date.now() },
        { role: "assistant", content: "", ts: Date.now(), streaming: true },
      ]);
      try {
        await client.sendMessage(conversationId, t, { nonce });
      } catch (e) {
        setError(errText(e));
        setBusy(false);
      }
    },
    [client, conversationId],
  );

  return { messages, busy, error, send };
}
