import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import type { ConversationSummary, HoustonEngineClient } from "@houston/engine-client";
import { ui } from "./styles";
import { useConversation, uuid } from "./use-conversation";

/** Conversation sidebar + an isolated, streaming chat for the active conversation. */
export function ChatView({ client }: { client: HoustonEngineClient }) {
  const [convos, setConvos] = useState<ConversationSummary[]>([]);
  const [active, setActive] = useState(uuid);
  const [input, setInput] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const { messages, busy, error, send } = useConversation(client, active);

  const loadConvos = useCallback(() => {
    client
      .listConversations()
      .then(setConvos)
      .catch((e) => setListError(e instanceof Error ? e.message : String(e)));
  }, [client]);

  // Refresh the sidebar on mount and whenever a turn settles (busy → false).
  useEffect(() => {
    if (!busy) loadConvos();
  }, [busy, loadConvos]);
  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [messages]);

  const submit = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await send(text);
  };

  const banner = error ?? listError;

  return (
    <div style={ui.shell}>
      <aside style={ui.sidebar}>
        <button style={ui.newChat} onClick={() => setActive(uuid())}>
          + New chat
        </button>
        {convos.map((c) => (
          <button
            key={c.id}
            style={{ ...ui.convItem, ...(c.id === active ? ui.convActive : {}) }}
            onClick={() => setActive(c.id)}
          >
            <div style={ui.convTitle}>{c.title || c.id}</div>
            {c.lastMessage ? <div style={ui.convLast}>{c.lastMessage}</div> : null}
          </button>
        ))}
      </aside>
      <main style={ui.main}>
        {banner ? <div style={errorBanner}>{banner}</div> : null}
        <div ref={logRef} style={ui.log}>
          {messages.map((m, i) => (
            <div key={i} style={m.role === "user" ? ui.userMsg : ui.asstMsg}>
              {m.content || (m.streaming ? "…" : "")}
            </div>
          ))}
        </div>
        <div style={ui.composer}>
          <input
            style={ui.composerInput}
            value={input}
            placeholder="Message Houston…"
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <button style={ui.sendBtn} onClick={() => void submit()} disabled={busy}>
            Send
          </button>
        </div>
      </main>
    </div>
  );
}

const errorBanner: CSSProperties = {
  margin: "10px 20px 0",
  padding: "8px 12px",
  borderRadius: 8,
  background: "rgba(229,72,77,0.15)",
  color: "#ff8a8e",
  fontSize: 13,
};
