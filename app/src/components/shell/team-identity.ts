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

export interface TeamIdentityGlyphChoice extends SidebarGroupGlyphChoice {
  concepts: string;
}

export interface TeamIdentityChoices {
  glyphs: TeamIdentityGlyphChoice[];
  colors: SidebarGroupSwatch[];
  labels: SidebarGroupIdentityLabels;
}

export function buildTeamIdentityChoices(
  t: TFunction<["shell"]>,
): TeamIdentityChoices {
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

export function teamPaletteColorId(
  stored: string | undefined,
): string | undefined {
  if (!stored) return undefined;
  return AGENT_COLORS.find(
    (entry) =>
      entry.id === stored || entry.light === stored || entry.dark === stored,
  )?.id;
}
