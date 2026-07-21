import { HoustonAvatar } from "@houston-ai/core";
import type { ComputeAgentTotals } from "./compute-usage-model";

interface ComputeAgentRowProps {
  agent: ComputeAgentTotals;
  /** Display name resolved from the slug. */
  name: string;
  /** Resolved agent color (semantic hex), for the avatar tint. */
  color?: string;
  /** Busiest agent's workMs (≥ 1), to scale this row's bar. */
  max: number;
  /** Formatted time worked ("3h 12m"). */
  duration: string;
  /** Formatted message count ("12 messages"). */
  messages: string;
}

/**
 * One agent's time worked in the Compute section: avatar + name + duration
 * and message count + a tokened track bar scaled to the busiest agent (the same
 * shape as the org Usage tab's rows, minus the expandable breakdown — time
 * worked is per-agent, not per-person). Deliberately no liveness badge: the
 * pod's up/idle state is infrastructure the user never needs to see.
 */
export function ComputeAgentRow({
  agent,
  name,
  color,
  max,
  duration,
  messages,
}: ComputeAgentRowProps) {
  const pct = Math.max(2, Math.round((agent.workMs / max) * 100));
  return (
    <li className="flex items-center gap-3 border-b border-line/40 py-3 last:border-0">
      <HoustonAvatar color={color} diameter={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-ink">{name}</span>
          <span className="shrink-0 text-sm text-ink-muted">
            {duration}
            <span aria-hidden> · </span>
            {messages}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-chip">
          <div
            className="h-full rounded-full bg-action"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </li>
  );
}
