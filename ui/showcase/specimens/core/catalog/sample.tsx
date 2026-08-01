import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  FileText,
  Inbox,
  Mail,
  MessageSquare,
  NotebookPen,
  Receipt,
} from "lucide-react";

/**
 * The catalog family's shared sample content. Every component in the family is
 * domain-blind — it takes an `icon` node, strings, and trailing nodes from its
 * consumer — so the specimens need one honest stand-in for what Houston
 * actually puts in those slots: agents and the apps they connect to.
 */

/** The ~40px art a real catalog row leads with (brand logo, letter avatar or
 *  glyph tile). Token fills only, so it reads in both themes. */
export function SampleIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-chip-subtle text-ink-muted">
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

export interface SampleItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Agents a user already has — what the shell's installed strip holds. */
export const installedAgents: readonly SampleItem[] = [
  {
    icon: Inbox,
    title: "Inbox Zero",
    description: "Triages email each morning and drafts the replies.",
  },
  {
    icon: NotebookPen,
    title: "Meeting Notes",
    description: "Turns every call recording into notes and next steps.",
  },
];

/** Agents on offer — the discovery half of a catalog surface. */
export const availableAgents: readonly SampleItem[] = [
  {
    icon: Receipt,
    title: "Expense Tracker",
    description: "Reads receipts from your inbox and files them by project.",
  },
  {
    icon: CalendarDays,
    title: "Standup Digest",
    description: "Posts yesterday's progress to the team every morning.",
  },
  {
    icon: FileText,
    title: "Contract Reader",
    description: "Summarises contracts and flags the clauses worth a look.",
  },
  {
    icon: MessageSquare,
    title: "Support Triage",
    description: "Sorts incoming tickets and answers the repeat questions.",
  },
];

/** An app a catalog row can connect — the integrations flavour of a row. */
export const sampleApp: SampleItem = {
  icon: Mail,
  title: "Gmail",
  description: "Read and send mail on your behalf.",
};
