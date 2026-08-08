import type { SidebarGroupView } from "@houston-ai/layout";
import { SidebarGroupHeader } from "@houston-ai/layout";
import type { ReactNode } from "react";
import { useState } from "react";

import { GROUP_LABELS } from "./sidebar-group-header-api";

/** Group headers live on the rail, at the rail's width. */
export function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="w-[220px] space-y-1 rounded-xl bg-sidebar px-2 py-2">
      {children}
    </div>
  );
}

/** Collapse and rename both move real state, as they do in the shell. */
export function LiveGroup({
  initial,
  startRenaming,
}: {
  initial: SidebarGroupView;
  startRenaming?: boolean;
}) {
  const [group, setGroup] = useState(initial);
  return (
    <SidebarGroupHeader
      group={group}
      count={group.itemIds.length}
      labels={GROUP_LABELS}
      startRenaming={startRenaming}
      onToggleCollapsed={() =>
        setGroup((one) => ({ ...one, collapsed: !one.collapsed }))
      }
      onRenameGroup={(_id, name) => setGroup((one) => ({ ...one, name }))}
      onEditContext={() => setGroup((one) => ({ ...one, collapsed: false }))}
    />
  );
}

/**
 * The create-then-name flow, live: the row is only local until a name is
 * committed, so `onCancelRename` is the one thing that can take it back off the
 * screen. Type a name and press Enter, or press Escape and watch it go.
 */
export function LiveDraft() {
  const [drafting, setDrafting] = useState(true);
  const [outcome, setOutcome] = useState<string | null>(null);
  if (!drafting) {
    return (
      <button
        type="button"
        className="px-1.5 py-1 text-left text-[13px] text-ink-muted"
        onClick={() => {
          setOutcome(null);
          setDrafting(true);
        }}
      >
        {outcome
          ? `Created “${outcome}”. Draft again`
          : "Abandoned, nothing created. Draft again"}
      </button>
    );
  }
  return (
    <SidebarGroupHeader
      group={{ id: "team:draft", name: "", collapsed: false, itemIds: [] }}
      count={0}
      labels={GROUP_LABELS}
      startRenaming
      onRenameGroup={(_id, name) => {
        setOutcome(name);
        setDrafting(false);
      }}
      onCancelRename={() => setDrafting(false)}
    />
  );
}
