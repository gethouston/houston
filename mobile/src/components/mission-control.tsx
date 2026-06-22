// Unified missions list across every agent in the paired workspace.
// Grouped by status — "Needs you" first, then Running, Queued, Done.
//
// Data comes from `listAllConversations` and reacts to ActivityChanged /
// ConversationsChanged WS events via use-engine-invalidation.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";
import {
  Button,
  HoustonAvatar,
  resolveAgentColor,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import type { Agent, ConversationEntry } from "@houston-ai/engine-client";
import {
  useAllConversations,
  useCurrentWorkspace,
} from "../hooks/use-conversations";
import { useAgents } from "../hooks/use-agents";
import { NewMissionSheet } from "./new-mission-sheet";

const SECTIONS: Array<{ id: string; label: string }> = [
  { id: "needs_you", label: "Needs You" },
  { id: "running", label: "Running" },
  { id: "queued", label: "Queued" },
  { id: "done", label: "Done" },
];

const ALL_AGENTS = "__all__";

export function MissionControl() {
  const nav = useNavigate();
  const ws = useCurrentWorkspace();
  const { data: agents } = useAgents(ws?.id ?? null);
  const {
    data: conversations,
    initializing,
    error,
    refetch,
    isFetching,
  } = useAllConversations();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [agentFilter, setAgentFilter] = useState<string>(ALL_AGENTS);

  // Apply the agent filter BEFORE grouping so each section's count
  // reflects what the user actually sees, not the unfiltered total.
  const visibleConversations = useMemo(() => {
    if (agentFilter === ALL_AGENTS) return conversations ?? [];
    return (conversations ?? []).filter((c) => c.agent_path === agentFilter);
  }, [conversations, agentFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, ConversationEntry[]>();
    for (const c of visibleConversations) {
      const key = c.status ?? "other";
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [visibleConversations]);

  // Fast lookup of agent by folderPath → fills the avatar color + initial.
  const agentByPath = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents ?? []) m.set(a.folderPath, a);
    return m;
  }, [agents]);

  const hasAgents = (agents?.length ?? 0) > 0;

  return (
    <div className="flex min-h-full flex-col bg-background safe-top">
      <header className="flex items-center justify-between px-4 pt-5 pb-3">
        <div>
          <h1 className="text-xl font-semibold leading-tight">Houston</h1>
          <p className="text-xs text-muted-foreground">
            {ws?.name ?? "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-accent"
            onClick={() => refetch()}
            aria-label="Refresh"
          >
            <RefreshCw
              className={`size-4 ${isFetching ? "animate-spin" : ""}`}
            />
          </button>
          <Button
            size="sm"
            className="rounded-full h-9 gap-1.5"
            onClick={() => setSheetOpen(true)}
          >
            <Plus className="size-3.5" />
            New mission
          </Button>
        </div>
      </header>

      {hasAgents && (
        <div className="px-4 pb-2">
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-9 w-full rounded-full text-xs">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_AGENTS}>All agents</SelectItem>
              {(agents ?? []).map((a) => (
                <SelectItem key={a.id} value={a.folderPath}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {initializing && (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="size-6 border-[3px] border-muted-foreground/30 border-t-primary rounded-full animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Loading missions…</p>
          </div>
        )}

        {!initializing && error && (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <AlertTriangle className="size-8 text-amber-500 mb-3" />
            <p className="text-base font-medium">Can&rsquo;t reach your Mac</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Make sure Houston is still open on your Mac, then tap retry.
            </p>
            <button
              type="button"
              className="touchable mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground active:opacity-80"
              onClick={() => refetch()}
            >
              <RefreshCw className="size-3.5" />
              Retry
            </button>
          </div>
        )}

        {!initializing && !error && visibleConversations.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-medium">
              {agentFilter === ALL_AGENTS
                ? "No missions yet."
                : "No missions for this agent."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap &ldquo;New mission&rdquo; to kick one off.
            </p>
          </div>
        )}

        {SECTIONS.map((s) => {
          const items = grouped.get(s.id);
          if (!items?.length) return null;
          return (
            <Section key={s.id} label={s.label} count={items.length}>
              {items.map((c) => (
                <ConversationRow
                  key={c.session_key}
                  convo={c}
                  agent={agentByPath.get(c.agent_path)}
                  onSelect={() =>
                    nav(
                      `/session/${encodeURIComponent(c.session_key)}?agent=${encodeURIComponent(c.agent_path)}`,
                    )
                  }
                />
              ))}
            </Section>
          );
        })}
      </div>

      <NewMissionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        agents={agents ?? []}
      />
    </div>
  );
}

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="px-4 pt-3 pb-1 flex items-baseline gap-2">
        <h2 className="text-xs font-semibold tracking-tight text-muted-foreground">
          {label}
        </h2>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <ul className="border-t border-border">{children}</ul>
    </section>
  );
}

function ConversationRow({
  convo,
  agent,
  onSelect,
}: {
  convo: ConversationEntry;
  agent: Agent | undefined;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="touchable w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-accent active:bg-accent/70"
        onClick={onSelect}
      >
        <HoustonAvatar
          color={resolveAgentColor(agent?.color)}
          diameter={40}
          running={convo.status === "running"}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{convo.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {convo.agent_name}
          </p>
        </div>
      </button>
    </li>
  );
}
