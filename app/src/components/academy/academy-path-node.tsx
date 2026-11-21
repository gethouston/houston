import { Button, cn } from "@houston-ai/core";
import { Check, Lock, Play, StepForward } from "lucide-react";
import { SpecChip } from "../spec-chip";

export type AcademyNodeState = "completed" | "started" | "available" | "locked";

export function AcademyPathNode(props: {
  state: AcademyNodeState;
  title: string;
  description: string;
  chip?: string;
  action?: { label: string; onClick: () => void };
  last?: boolean;
}) {
  const locked = props.state === "locked";
  return (
    <li
      className={cn(
        "relative flex gap-4 rounded-lg py-3 pr-2 pl-1",
        locked ? null : "transition-colors hover:bg-hover",
      )}
    >
      {props.last ? null : (
        <span
          aria-hidden
          className="absolute top-12 bottom-0 left-5 w-px bg-line"
        />
      )}
      <NodeMarker state={props.state} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-sm font-medium",
              locked ? "text-ink-muted" : "text-ink",
            )}
          >
            {props.title}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">{props.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {props.chip ? (
            <SpecChip className="tabular-nums">{props.chip}</SpecChip>
          ) : null}
          {props.action ? (
            <Button
              size="sm"
              variant={props.state === "completed" ? "outline" : "default"}
              className="rounded-full"
              onClick={props.action.onClick}
            >
              {props.action.label}
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function NodeMarker(props: { state: AcademyNodeState }) {
  const icon =
    props.state === "completed" ? (
      <Check className="h-4 w-4" aria-hidden />
    ) : props.state === "locked" ? (
      <Lock className="h-4 w-4" aria-hidden />
    ) : props.state === "started" ? (
      <StepForward className="h-4 w-4" aria-hidden />
    ) : (
      <Play className="h-4 w-4" aria-hidden />
    );
  return (
    <span
      className={cn(
        "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
        props.state === "completed"
          ? "border-transparent bg-action text-action-text"
          : props.state === "locked"
            ? "border-line bg-chip-subtle text-ink-muted"
            : props.state === "started"
              ? "border-action bg-card text-ink"
              : "border-line bg-card text-ink",
      )}
    >
      {icon}
    </span>
  );
}
