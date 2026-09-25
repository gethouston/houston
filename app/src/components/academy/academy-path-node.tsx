import { Button, cn } from "@houston-ai/core";
import { Check, Lock, Play, StepForward } from "lucide-react";
import { SpecChip } from "../spec-chip";

/** What a node on the path is doing right now. `started` is a lesson the user
 *  began and left: it resumes rather than starts. */
export type AcademyNodeState = "completed" | "started" | "available" | "locked";

/**
 * One stop on the Academy path: a marker, what the lesson is, and the one
 * thing to do about it.
 *
 * Props-only and state-driven rather than three near-copies of a row, so the
 * marker, the tone and the affordance can never disagree about the same
 * chapter. A locked node carries no button at all — a disabled control invites
 * a click that answers nothing.
 *
 * Rows are transparent planes joined by a hairline rail, not a grid of bordered
 * cards: a path reads as one line the eye can follow. A row you can act on
 * paints the app's own row fill under the pointer, exactly as the flat page
 * language does everywhere else; a LOCKED row stays flat and quiet, because
 * painting a row that answers nothing is a promise the path cannot keep. The
 * focus ring belongs to the button inside the row and to nothing else — a
 * second ring around the whole row would draw two rectangles for one target.
 */
export function AcademyPathNode(props: {
  state: AcademyNodeState;
  title: string;
  description: string;
  /** The count the node carries: experience banked on a completed lesson,
   *  the beat it resumes on for a started one. */
  chip?: string;
  /** The node's single action. Omitted on a locked node. */
  action?: { label: string; onClick: () => void };
  /** Draws no rail below, so the path ends cleanly. */
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
            // The same quiet chip the status header wears for usage points:
            // one shape for "a count you already banked", so the page never
            // asks which of two pills means what.
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
