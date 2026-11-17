// `.ts` extensions so the node test runner can load this module on its own.

import { AGENT_COMMON_ROLES } from "../../../lib/agent-role-catalog-data.ts";
import type { AgentRoleId } from "../../../lib/agent-role-catalog.ts";
import { type BasicTeamDraft, draftFor } from "./basic-team-model.ts";

/**
 * The team with one more card, on TOP, where the person pressing "Hire one
 * more" sees it: the first shared job (`AGENT_COMMON_ROLES`, read right in any
 * industry) no card began as, or, once all of them are dealt, the first shared
 * job again under a fresh key. The person changes its job on the card like
 * any other's.
 *
 * A default color is dealt by place (`basicTeamColors`), so a card arriving
 * first would move every other card's color. The colors shown are pinned to
 * the cards that wear them, and the new card takes the next free one.
 */
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

/** Each draft wearing the color it shows, so no card changes color when
 *  another card arrives or leaves. */
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

/** A picked swatch trades places with the card already wearing it. */
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

/** Whether the card at `index` may be let go: a draft not yet hired, while
 *  another card would still stand. */
export function basicTeamRemovable(
  drafts: readonly BasicTeamDraft[],
  index: number,
): boolean {
  return drafts.length > 1 && drafts[index]?.rosterKey === null;
}

/** The team without the card at `index`, when it may be let go; the others
 *  keep the colors they show. */
export function basicTeamRemove(
  drafts: readonly BasicTeamDraft[],
  index: number,
  shownColors: readonly string[],
): BasicTeamDraft[] {
  if (!basicTeamRemovable(drafts, index)) return [...drafts];
  return pinColors(drafts, shownColors).filter((_, at) => at !== index);
}
