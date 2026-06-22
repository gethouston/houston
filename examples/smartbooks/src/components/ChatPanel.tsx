import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { topics } from "@houston-ai/engine-client";
import type { AgentConfig } from "../lib/config";
import type { Client } from "../lib/clients";
import { clientContextLine } from "../lib/clients";
import { getClient, getWs } from "../lib/engine";
import type { FeedItem, HoustonEvent, Message } from "../lib/feed";
import { appendFeedItem } from "../lib/feed";

export interface ChatHandle {
  /** Run a programmatic prompt (e.g. auto-process-on-upload). */
  runPrompt: (prompt: string) => Promise<void>;
  /** Is a turn currently in flight? */
  isBusy: () => boolean;
}

interface Props {
  agent: AgentConfig;
  /** Currently-selected client — used to auto-prefix free-form prompts. */
  client: Client | null;
  /** Controlled from the parent — allows ⌘K to toggle. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Cursor-style right rail:
 *  - Collapsed by default: thin 48px strip with an "Ask" button + activity dot
 *  - Expanded: 360px panel with a transcript + composer
 *  - ⌘K from the parent toggles the same state
 *
 * The transcript is the ESCAPE HATCH for soft-workflow requests. 90% of
 * the user's journey shouldn't involve opening this panel at all.
 */
export const ChatPanel = forwardRef<ChatHandle, Props>(function ChatPanel(
  { agent, client, open, onOpenChange },
  ref,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [hasNew, setHasNew] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Load prior session history once per agent/session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const history = await getClient().loadChatHistory(
          agent.agentPath,
          agent.sessionKey,
        );
        if (cancelled) return;
        const replay: Message[] = [];
        for (const entry of history) {
          const item = {
            feed_type: entry.feed_type,
            data: entry.data,
          } as FeedItem;
          const next = appendFeedItem(replay, item);
          replay.splice(0, replay.length, ...next);
        }
        setMessages(replay);
      } catch (err) {
        console.warn("history load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agent.agentPath, agent.sessionKey]);

  // Subscribe to this session's feed + auth events.
  useEffect(() => {
    const ws = getWs();
    ws.subscribe([topics.session(agent.sessionKey), topics.auth]);
    const off = ws.onEvent((raw) => {
      const ev = raw as HoustonEvent;
      if (ev.type === "FeedItem") {
        const payload = ev.data as { session_key: string; item: FeedItem };
        if (payload.session_key !== agent.sessionKey) return;
        setMessages((prev) => appendFeedItem(prev, payload.item));
        // If the chat is closed and a final assistant message arrives,
        // show a subtle "new reply" dot on the collapsed strip.
        if (!open && payload.item.feed_type === "assistant_text") {
          setHasNew(true);
        }
      } else if (ev.type === "SessionStatus") {
        const payload = ev.data as { status: string; error: string | null };
        if (payload.status === "running") {
          setStatus("running");
          setError(null);
        } else if (
          payload.status === "completed" ||
          payload.status === "done"
        ) {
          setStatus("idle");
        } else if (payload.status === "error" || payload.error) {
          setStatus("error");
          setError(payload.error ?? "Session error");
        }
      } else if (ev.type === "AuthRequired") {
        const payload = ev.data as { provider: string; message: string };
        setStatus("error");
        setError(`${payload.provider} needs login: ${payload.message}`);
      }
    });
    return off;
  }, [agent.sessionKey, open]);

  // Clear the "new" dot when opened.
  useEffect(() => {
    if (open) setHasNew(false);
  }, [open]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, open]);

  async function runPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "user", text: trimmed },
    ]);
    setStatus("running");
    try {
      await getClient().startSession(agent.agentPath, {
        sessionKey: agent.sessionKey,
        prompt: trimmed,
        source: "smartbooks",
      });
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function sendFromInput() {
    if (!input.trim() || status === "running") return;
    const ctx = client ? clientContextLine(client) + "\n" : "";
    const prompt = `${ctx}${input.trim()}`;
    setInput("");
    await runPrompt(prompt);
  }

  useImperativeHandle(ref, () => ({
    runPrompt,
    isBusy: () => status === "running",
  }));

  // ---------- Collapsed rail ----------

  if (!open) {
    return (
      <aside className="chat-rail">
        <button
          className={`chat-rail__toggle${hasNew ? " chat-rail__toggle--new" : ""}`}
          onClick={() => onOpenChange(true)}
          title="Customize SmartBooks (⌘K)"
        >
          <span className="chat-rail__icon" aria-hidden>
            {status === "running" ? (
              <span className="typing">
                <span />
                <span />
                <span />
              </span>
            ) : (
              // A wrench conveys "fix/change the tool itself" better
              // than a speech bubble, which reads as chat.
              <WrenchIcon />
            )}
          </span>
          <span className="chat-rail__label">Customize</span>
          <span className="chat-rail__kbd">⌘K</span>
          {hasNew && <span className="chat-rail__dot" aria-hidden />}
        </button>
      </aside>
    );
  }

  // ---------- Expanded panel ----------

  return (
    <aside className="chat-panel">
      <header className="chat-panel__header">
        <div className="chat-panel__titlebar">
          <span className="chat-panel__title">Customize</span>
          <button
            className="chat-panel__close"
            onClick={() => onOpenChange(false)}
            title="Close (⌘K)"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <span className="muted chat-panel__context">
          {client ? `Working on · ${client.name}` : "No client selected"}
        </span>
      </header>

      <div className="chat-panel__scroller" ref={scrollerRef}>
        {messages.length === 0 && (
          <div className="chat-panel__empty">
            <p className="chat-panel__pitch">
              Tell SmartBooks how to work for you. Your bookkeeper edits the app
              itself — columns, categories, rules — so every future statement
              handles your edge cases automatically.
            </p>
            <p className="muted chat-panel__pitch-small">Try:</p>
            <ul className="chips">
              <li>"Add a Tax column that detects GST and VAT"</li>
              <li>"Remember that Acme charges are always Cloud"</li>
              <li>"Merge these receipts from John into the table"</li>
              <li>"Split Description into Merchant and Memo"</li>
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
        {status === "running" && (
          <div className="msg msg--status">
            <span className="typing">
              <span />
              <span />
              <span />
            </span>
            <span>Working…</span>
          </div>
        )}
      </div>

      {error && <div className="banner banner--error">{error}</div>}

      <div className="chat-panel__composer">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendFromInput();
            }
          }}
          placeholder={
            client
              ? `Ask about ${client.name}…`
              : "Pick a client first, then ask anything."
          }
          disabled={status === "running" || !client}
        />
        <div className="chat-panel__actions">
          <button
            type="button"
            className="btn btn--primary btn--small"
            onClick={() => void sendFromInput()}
            disabled={!input.trim() || status === "running" || !client}
          >
            {status === "running" ? "Working…" : "Customize"}
          </button>
        </div>
      </div>
    </aside>
  );
});

function WrenchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-3 3-2-2 3-3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MessageRow({ message }: { message: Message }) {
  if (message.kind === "user") {
    return (
      <div className="msg msg--user">
        <div className="msg__body">{stripContext(message.text)}</div>
      </div>
    );
  }
  if (message.kind === "assistant") {
    return (
      <div className="msg msg--assistant">
        <div className="msg__body">{message.text}</div>
      </div>
    );
  }
  if (message.kind === "thinking") {
    return (
      <div className="msg msg--thinking">
        <span className="msg__label">Thinking</span>
        <div className="msg__body">{message.text}</div>
      </div>
    );
  }
  if (message.kind === "tool") {
    const err = message.error ? " msg--error" : "";
    return (
      <div className={`msg msg--tool${err}`}>
        <span className="msg__label">{message.toolName ?? "tool"}</span>
        {message.text && <span className="msg__body">{message.text}</span>}
      </div>
    );
  }
  if (message.kind === "final") {
    return <div className="msg msg--final">{message.text}</div>;
  }
  return (
    <div className="msg msg--system">
      <span className="msg__body">{message.text}</span>
    </div>
  );
}

function stripContext(text: string): string {
  return text.replace(/^\(client: [^)]+, folder: [^)]+\)\n/, "");
}
