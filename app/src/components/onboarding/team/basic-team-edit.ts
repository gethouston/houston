import type { AgentRoleId } from "../../../lib/agent-role-catalog.ts";
import { AGENT_COMMON_ROLES } from "../../../lib/agent-role-catalog-data.ts";
import { type BasicTeamDraft, draftFor } from "./basic-team-model.ts";

export function basicTeamAdd(
  drafts: readonly BasicTeamDraft[],
  roleLabel: (id: AgentRoleId) => string,
  shownColors: readonly string[],
  nextColor: (taken: readonly string[]) => string,
): BasicTeamDraft[] {
  const dealt = new Set<AgentRoleId>(drafts.map((draft) => draft.roleId));
  const roleId =
    AGENT_COMMON_ROLES.find((id) => !dealt.has(id)) ?? AGENT_COMMON_ROLES[0];
  const keys = new Set(drafts.map((draft) => draft.key));
  let key: string = roleId;
  for (let n = 2; keys.has(key); n++) key = `${roleId}-${n}`;
  const added: BasicTeamDraft = {
    ...draftFor(roleId, roleLabel(roleId)),
    key,
    color: nextColor(shownColors),
  };
  return [added, ...pinColors(drafts, shownColors)];
}

function pinColors(
  drafts: readonly BasicTeamDraft[],
  shownColors: readonly string[],
): BasicTeamDraft[] {
  return drafts.map((draft, at) =>
    draft.color === null && shownColors[at] !== undefined
      ? { ...draft, color: shownColors[at] }
      : draft,
  );
}

export function basicTeamRecolor(
  drafts: readonly BasicTeamDraft[],
  index: number,
  color: string,
  shownColors: readonly string[],
): BasicTeamDraft[] {
  if (drafts[index] === undefined) return [...drafts];
  const previous = shownColors[index];
  const other = shownColors.findIndex(
    (shown, at) => at !== index && shown === color,
  );
  return drafts.map((draft, at) => ({
    ...draft,
    color:
      at === index
        ? color
        : at === other
          ? (previous ?? draft.color)
          : (shownColors[at] ?? draft.color),
  }));
}

export function basicTeamRemovable(
  drafts: readonly BasicTeamDraft[],
  index: number,
): boolean {
  return drafts.length > 1 && drafts[index]?.rosterKey === null;
}

export function basicTeamRemove(
  drafts: readonly BasicTeamDraft[],
  index: number,
  shownColors: readonly string[],
): BasicTeamDraft[] {
  if (!basicTeamRemovable(drafts, index)) return [...drafts];
  return pinColors(drafts, shownColors).filter((_, at) => at !== index);
}
