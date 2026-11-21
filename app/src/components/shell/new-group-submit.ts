import { teamNameTooLong } from "./team-identity-save.ts";

export interface NewGroupDraft {
  name: string;
  icon?: string;
  color?: string;
}

export function submitNewGroup(
  draft: NewGroupDraft,
  deps: {
    createGroup: (
      name: string,
      identity: { icon?: string; color?: string },
    ) => string | null;
    onCreated: () => void;
    report: (command: string, err: unknown) => void;
  },
): void {
  const trimmed = draft.name.trim();
  if (!trimmed || teamNameTooLong(draft.name)) return;
  const id = deps.createGroup(trimmed, {
    icon: draft.icon,
    color: draft.color,
  });
  if (id === null) {
    deps.report(
      "sidebar_group_create",
      new Error("Sidebar group was not written"),
    );
    return;
  }
  deps.onCreated();
}
