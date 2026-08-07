import type { SidebarSectionRow } from "@houston-ai/layout";
import { LayoutDashboard, Settings } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The destination rows a team block carries above its agents, built the way the
 * desktop shell builds them: one fixed table of labels and glyphs, stamped per
 * block with a block-scoped row id so two teams' Mission Control rows are two
 * distinct selectable destinations.
 */

/** The destinations a group carries above its agents, as the shell builds them. */
const SECTION_LABELS: readonly {
  id: string;
  label: string;
  icon: ReactNode;
}[] = [
  {
    id: "mission-control",
    label: "Mission Control",
    icon: <LayoutDashboard className="size-4" />,
  },
  {
    id: "settings",
    label: "Team Settings",
    icon: <Settings className="size-4" />,
  },
];

export function sectionRows(
  blockId: string,
  activeId: string | null,
  onSelect: (rowId: string) => void,
): SidebarSectionRow[] {
  return SECTION_LABELS.map((s) => {
    const id = `${blockId}:${s.id}`;
    return {
      id,
      label: s.label,
      icon: s.icon,
      active: id === activeId,
      onSelect: () => onSelect(id),
    };
  });
}
