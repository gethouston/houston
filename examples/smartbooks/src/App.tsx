import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentConfig, EngineConfig } from "./lib/config";
import {
  clearEngineConfig,
  hasUserOverride,
  resolveEngineConfig,
  saveEngineConfig,
} from "./lib/config";
import { connectEngine, getClient, getWs } from "./lib/engine";
import { ensureAgent } from "./lib/bootstrap";
import { listClients } from "./lib/clients";
import type { Client } from "./lib/clients";
import { topics } from "@houston-ai/engine-client";
import type { HoustonEvent } from "./lib/feed";
import { ConnectScreen } from "./components/ConnectScreen";
import { Sidebar } from "./components/Sidebar";
import { ClientView } from "./components/ClientView";
import { ChatPanel } from "./components/ChatPanel";
import type { ChatHandle } from "./components/ChatPanel";
import { NewClientDialog } from "./components/NewClientDialog";

type Status =
  | { kind: "connecting"; config: EngineConfig }
  | { kind: "ready"; engine: EngineConfig; agent: AgentConfig }
  | { kind: "error"; message: string; config: EngineConfig };

export function App() {
  const [status, setStatus] = useState<Status>(() => ({
    kind: "connecting",
    config: resolveEngineConfig(),
  }));

  useEffect(() => {
    if (status.kind !== "connecting") return;
    const cfg = status.config;
    let cancelled = false;
    (async () => {
      try {
        const client = connectEngine(cfg);
        await client.health();
        const agent = await ensureAgent(client);
        if (!cancelled) setStatus({ kind: "ready", engine: cfg, agent });
      } catch (err) {
        if (!cancelled) {
          setStatus({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
            config: cfg,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status.kind, status.kind === "connecting" ? status.config : null]);

  if (status.kind === "error") {
    return (
      <ConnectScreen
        error={status.message}
        defaults={status.config}
        onConnect={async (baseUrl, token) => {
          saveEngineConfig({ baseUrl, token });
          setStatus({ kind: "connecting", config: { baseUrl, token } });
        }}
      />
    );
  }

  if (status.kind === "connecting") {
    return (
      <div className="screen screen--center">
        <div className="brand brand--large">
          <Logo />
          <span>SmartBooks</span>
        </div>
        <p className="muted">Setting up your workspace…</p>
      </div>
    );
  }

  return (
    <Ready engine={status.engine} agent={status.agent} setStatus={setStatus} />
  );
}

interface ReadyProps {
  engine: EngineConfig;
  agent: AgentConfig;
  setStatus: (s: Status) => void;
}

function Ready({ engine, agent, setStatus }: ReadyProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<Client | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const chatRef = useRef<ChatHandle | null>(null);

  const refresh = useCallback(async () => {
    const list = await listClients(agent.agentPath);
    setClients(list);
    setSelected((current) => {
      if (current) {
        const found = list.find((c) => c.id === current.id);
        if (found) return found;
      }
      return list[0] ?? null;
    });
  }, [agent.agentPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // File-change events → refresh the client list (new clients, etc.)
  useEffect(() => {
    const ws = getWs();
    ws.subscribe([topics.agent(agent.agentPath)]);
    const off = ws.onEvent((raw) => {
      const ev = raw as HoustonEvent;
      if (ev.type !== "FilesChanged") return;
      const data = ev.data as { agent_path: string };
      if (data.agent_path === agent.agentPath) void refresh();
    });
    return off;
  }, [agent.agentPath, refresh]);

  // ⌘K / Ctrl+K toggles the Customize panel.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setChatOpen((v) => !v);
      }
      if (e.key === "Escape" && chatOpen) {
        setChatOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [chatOpen]);

  function onRunPrompt(prompt: string) {
    const handle = chatRef.current;
    if (!handle) return;
    setBusy(true);
    // For auto-triggered work (upload auto-process), we do NOT force the
    // panel open — the user shouldn't be yanked into a chat transcript
    // unless they asked to see it. The topbar status indicator + the
    // tool-pill notification dot on the rail tell them work is running.
    void handle.runPrompt(prompt).finally(() => {
      const tick = () => {
        if (handle.isBusy()) {
          requestAnimationFrame(tick);
        } else {
          setBusy(false);
        }
      };
      requestAnimationFrame(tick);
    });
  }

  return (
    <div className={`app${chatOpen ? " app--chat-open" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span>SmartBooks</span>
        </div>
        <div className="topbar__meta">
          {busy ? (
            <span className="status-pill status-pill--busy">
              <span className="typing">
                <span />
                <span />
                <span />
              </span>
              Working on {selected?.name ?? "your workspace"}
            </span>
          ) : (
            <>
              <span className="dot dot--ok" />
              <span className="muted">{engine.baseUrl}</span>
            </>
          )}
          {hasUserOverride() && (
            <button
              className="btn btn--ghost btn--small"
              onClick={() => {
                if (
                  !confirm(
                    "Reset to the default engine? Local chat will reload.",
                  )
                )
                  return;
                clearEngineConfig();
                setStatus({
                  kind: "connecting",
                  config: resolveEngineConfig(),
                });
              }}
            >
              Reset
            </button>
          )}
        </div>
      </header>

      <main className="app__main">
        <Sidebar
          clients={clients}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          onNew={() => setDialogOpen(true)}
        />

        <section className="app__workspace">
          {selected ? (
            <ClientView
              client={selected}
              agent={agent}
              busy={busy}
              onRunPrompt={onRunPrompt}
              onOpenCustomize={() => setChatOpen(true)}
            />
          ) : (
            <EmptyWorkspace onNew={() => setDialogOpen(true)} />
          )}
        </section>

        <ChatPanel
          ref={chatRef}
          agent={agent}
          client={selected}
          open={chatOpen}
          onOpenChange={setChatOpen}
        />
      </main>

      {dialogOpen && (
        <NewClientDialog
          agentPath={agent.agentPath}
          onClose={() => setDialogOpen(false)}
          onCreated={(c) => {
            setDialogOpen(false);
            void refresh().then(() => setSelected(c));
          }}
        />
      )}
    </div>
  );
}

function EmptyWorkspace({ onNew }: { onNew: () => void }) {
  return (
    <div className="workspace-empty">
      <h2>Welcome to SmartBooks</h2>
      <p className="muted">
        Add a client to get started. Drop a bank statement and SmartBooks will
        build the transaction table automatically.
      </p>
      <button className="btn btn--primary" onClick={onNew}>
        + Add your first client
      </button>
    </div>
  );
}

function Logo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="#0f6b4f" />
      <path
        d="M7 15 L10 10 L13 13 L17 8"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { getClient };
