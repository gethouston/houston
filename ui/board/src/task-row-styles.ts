import {
  Archive,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";

export type TaskRowStatus = "needs_you" | "running" | "done" | "archived";

export interface TaskRowLabels {
  needsYou?: string;
  running?: string;
  done?: string;
  archived?: string;
}

export interface TaskRowGlyph {
  Icon: LucideIcon;
  tone: string;
  label: string;
  spin: boolean;
}

const GLYPHS: Record<
  TaskRowStatus,
  Omit<TaskRowGlyph, "label"> & { fallback: string; key: keyof TaskRowLabels }
> = {
  needs_you: {
    Icon: CircleAlert,
    tone: "text-warning",
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
