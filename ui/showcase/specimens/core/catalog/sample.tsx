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

export const sampleApp: SampleItem = {
  icon: Mail,
  title: "Gmail",
  description: "Read and send mail on your behalf.",
};
