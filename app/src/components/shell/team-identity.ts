import { AGENT_COLORS, colorValue } from "@houston-ai/core";
import type {
  SidebarGroupGlyphChoice,
  SidebarGroupIdentityLabels,
  SidebarGroupSwatch,
} from "@houston-ai/layout";
import {
  SIDEBAR_GROUP_GLYPH_NAMES,
  sidebarGroupGlyphConcepts,
} from "@houston-ai/layout";
import type { TFunction } from "i18next";
import { AGENT_COLOR_LABEL_KEYS } from "./agent-sidebar-color-menu.tsx";

/**
 * Everything a team's ICON-AND-NAME editing is made of: the vocabulary the
 * picker offers and the reading of a team's stored colour.
 *
 * Its own module rather than lines inside `use-sidebar-teams-model.ts`, which
 * is at the file-size ceiling and whose job is composing the rail, not deciding
 * what a colour means.
 */

/**
 * One offerable mark, plus the words a reader might search it BY in their own
 * language. `@houston-ai/layout` curates each mark's concepts in English and
 * holds no translations (it is i18n-free by boundary), so the translating
 * happens here and rides along as one space-joined haystack.
 */
export interface TeamIdentityGlyphChoice extends SidebarGroupGlyphChoice {
  concepts: string;
}

/** The choices every team's picker offers — the same three for all of them. */
export interface TeamIdentityChoices {
  glyphs: TeamIdentityGlyphChoice[];
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
  // Each of the ~80 concept words is translated ONCE and shared by every mark
  // that carries it, rather than re-translated per mark: 233 marks times a
  // handful of tags each is thousands of lookups for a vocabulary this small.
  const concept = new Map<string, string>();
  const conceptsOf = (name: (typeof SIDEBAR_GROUP_GLYPH_NAMES)[number]) =>
    sidebarGroupGlyphConcepts(name)
      .map((tag) => {
        const cached = concept.get(tag);
        if (cached !== undefined) return cached;
        const translated = t(`shell:sidebar.teamIconConcepts.${tag}`);
        concept.set(tag, translated);
        return translated;
      })
      .join(" ");

  return {
    // Each mark is NAMED in the user's language, from its own key: an icon's
    // name is copy, not a slug title-cased at runtime, so a Spanish reader
    // hears "Billete de dólar" and can search for it.
    glyphs: SIDEBAR_GROUP_GLYPH_NAMES.map((name) => ({
      name,
      label: t(`shell:sidebar.teamIcons.${name}`),
      concepts: conceptsOf(name),
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
      search: t("shell:sidebar.teams.identitySearch"),
      emptySearch: t("shell:sidebar.teams.identitySearchEmpty"),
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
