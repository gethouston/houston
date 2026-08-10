import { AGENT_COLORS, colorValue } from "@houston-ai/core";
import type {
  SidebarGroupGlyphChoice,
  SidebarGroupIdentityLabels,
  SidebarGroupSwatch,
} from "@houston-ai/layout";
import { SIDEBAR_GROUP_GLYPH_NAMES } from "@houston-ai/layout";
import type { TFunction } from "i18next";
import { canRenameTeam, type TeamView } from "../../lib/teams-model.ts";
import { AGENT_COLOR_LABEL_KEYS } from "./agent-sidebar-color-menu.tsx";

/**
 * Everything a team's ICON-AND-NAME editing is made of: the vocabulary the
 * picker offers, the reading of a team's stored colour, and the gate deciding
 * WHOSE identity this caller may edit.
 *
 * Its own module rather than lines inside `use-sidebar-teams-model.ts`, which
 * is at the file-size ceiling and whose job is composing the rail, not deciding
 * what a colour means.
 */

/** The choices every team's picker offers — the same three for all of them. */
export interface TeamIdentityChoices {
  glyphs: SidebarGroupGlyphChoice[];
  colors: SidebarGroupSwatch[];
  labels: SidebarGroupIdentityLabels;
}

/**
 * The glyphs, colours and words the picker is drawn from. Built once per
 * language and shared by every block, since nothing here is per team.
 *
 * The colours are the AGENT palette, NOT a second one invented for teams: one
 * vocabulary means a team and an agent can never mean two different things by
 * "purple", and the swatch labels come from the agent colour menu's own map
 * rather than a copy that would drift from it. Each swatch's `value` is the
 * theme-reactive `var(--ht-agent-*)`, so the picker recolours on a theme flip
 * without a re-render.
 */
export function buildTeamIdentityChoices(
  t: TFunction<["shell"]>,
): TeamIdentityChoices {
  return {
    glyphs: SIDEBAR_GROUP_GLYPH_NAMES.map((name) => ({
      name,
      label: t(`shell:sidebar.teamIcons.${name}`),
    })),
    colors: AGENT_COLORS.map((entry) => ({
      id: entry.id,
      value: colorValue(entry),
      label: t(
        AGENT_COLOR_LABEL_KEYS[entry.id] ??
          "shell:sidebar.colorLabels.charcoal",
      ),
    })),
    labels: {
      trigger: t("shell:sidebar.teams.identity"),
      icons: t("shell:sidebar.teams.identityIcons"),
      colors: t("shell:sidebar.teams.identityColors"),
    },
  };
}

/**
 * The stored colour's PALETTE id, or `undefined` when it names no entry.
 *
 * Deliberately NOT `agentColorId`, which falls back to the first colour so a
 * picker always has one swatch marked. Here that would LIE: a server host may
 * hold a raw `#rrggbb` this client's palette does not contain, and lighting
 * charcoal would tell the user they picked a colour they never picked. No
 * match marks nothing, which is the honest reading of a colour we cannot name.
 */
export function teamPaletteColorId(
  stored: string | undefined,
): string | undefined {
  if (!stored) return undefined;
  return AGENT_COLORS.find(
    (entry) =>
      entry.id === stored || entry.light === stored || entry.dark === stored,
  )?.id;
}

/**
 * Whether this caller may edit `team`'s identity — its name, mark and colour,
 * which are ONE thing changed in one dialog (a team's mark is a rename by
 * another name).
 *
 * Server host: `canRenameTeam`, so the default team is included (C13 reads its
 * identity as a rename, not a structural change). LOCAL backend: named groups
 * only, because the default team is VIRTUAL there — it IS the workspace, with
 * no stored group row to hold an icon or a colour and nothing in the stack that
 * can change a workspace's identity.
 */
export function canEditTeamIdentity(
  team: TeamView,
  /** `hasAgentTeams(capabilities)` — the host owns the teams (C13). */
  serverBacked: boolean,
): boolean {
  return serverBacked ? canRenameTeam(team) : !team.isDefault;
}
