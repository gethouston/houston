import {
  Archive,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";

/**
 * The status a task row wears, and the glyph that says it. Pure, so the
 * mapping is unit-testable without a DOM and so no surface can invent a fifth
 * state or a second colour for one of these four.
 *
 * The four are the board's own sections plus the archive: a row's leading
 * glyph is the ONLY thing that names its state, because the phone lists group
 * by section already and a second badge on the row would repeat the heading.
 */
export type TaskRowStatus = "needs_you" | "running" | "done" | "archived";

/** English defaults; an app passes its own translations in. */
export interface TaskRowLabels {
  needsYou?: string;
  running?: string;
  done?: string;
  archived?: string;
}

export interface TaskRowGlyph {
  Icon: LucideIcon;
  /** The glyph's semantic tone class (a token utility, never a literal). */
  tone: string;
  /** The state, spoken: the glyph is the row's only state affordance. */
  label: string;
  /** Running is the one LIVE state, so it is the one glyph that moves. */
  spin: boolean;
}

const GLYPHS: Record<
  TaskRowStatus,
  Omit<TaskRowGlyph, "label"> & { fallback: string; key: keyof TaskRowLabels }
> = {
  needs_you: {
    Icon: CircleAlert,
    tone: "text-danger",
    spin: false,
    fallback: "Needs you",
    key: "needsYou",
  },
  running: {
    Icon: LoaderCircle,
    tone: "text-warning",
    spin: true,
    fallback: "Running",
    key: "running",
  },
  done: {
    Icon: CircleCheck,
    tone: "text-ink-muted",
    spin: false,
    fallback: "Done",
    key: "done",
  },
  archived: {
    Icon: Archive,
    tone: "text-ink-muted",
    spin: false,
    fallback: "Archived",
    key: "archived",
  },
};

export function taskRowGlyph(
  status: TaskRowStatus,
  labels?: TaskRowLabels,
): TaskRowGlyph {
  const { Icon, tone, spin, fallback, key } = GLYPHS[status];
  return { Icon, tone, spin, label: labels?.[key] ?? fallback };
}
