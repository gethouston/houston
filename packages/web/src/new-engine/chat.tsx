import { useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
  ConversationSummary,
  HoustonEngineClient,
} from "@houston/engine-client";
import { ui } from "./styles";

type Msg = ChatMessage & { streaming?: boolean };

/** Append to the latest assistant message in place (used while streaming). */
function bumpAssistant(messages: Msg[], update: (content: string) => string): Msg[] {
  const out = messages.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === "assistant") {
      out[i] = { ...out[i], content: update(out[i].content) };
      break;
    }
  }
  return out;
}

/** Conversation sidebar + streaming chat against the new engine. */
export function ChatView({ client }: { client: HoustonEngineClient }) {
  const [convos, setConvos] = useState<ConversationSummary[]>([]);
  const [active, setActive] = useState("main");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const loadConvos = () => client.listConversations().then(setConvos).catch(() => {});
  useEffect(() => { loadConvos(); }, [client]);
  useEffect(() => {
    client
      .getHistory(active)
      .then((h) => setMessages(h.messages))
      .catch(() => setMessages([]));
  }, [client, active]);
  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [messages]);

  const newChat = () => {
    setActive(`chat-${Date.now().toString(36)}`);
    setMessages([]);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [
      ...m,
      { role: "user", content: text, ts: Date.now() },
      { role: "assistant", content: "", ts: Date.now(), streaming: true },
    ]);
    try {
      for await (const ev of client.streamMessage(active, text)) {
        if (ev.type === "text") setMessages((m) => bumpAssistant(m, (c) => c + ev.data));
        else if (ev.type === "tool_start")
          setMessages((m) => bumpAssistant(m, (c) => `${c}\n🔧 ${ev.data.name}\n`));
        else if (ev.type === "error")
          setMessages((m) => bumpAssistant(m, (c) => `${c}\n⚠️ ${ev.data.message}`));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((m) => bumpAssistant(m, (c) => `${c}\n⚠️ ${msg}`));
    } finally {
      setMessages((m) => m.map((x) => (x.streaming ? { ...x, streaming: false } : x)));
      setBusy(false);
      loadConvos();
    }
  };

  return (
    <div style={ui.shell}>
      <aside style={ui.sidebar}>
        <button style={ui.newChat} onClick={newChat}>+ New chat</button>
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
                void send();
              }
            }}
          />
          <button style={ui.sendBtn} onClick={() => void send()} disabled={busy}>
            Send
          </button>
        </div>
      </main>
    </div>
  );
}
