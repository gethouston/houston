/**
 * The Tailwind text-colour class an AGENT's name wears when it is attributed
 * inside a chat bubble (WhatsApp-group-style sender attribution).
 *
 * The agent palette was tuned as avatar FILLS — white glyphs on a saturated
 * helmet. Reused as TEXT on the chat surface it is a different measurement
 * entirely, so legibility here is COMPUTED, never assumed: at module load each
 * agent colour is measured against the real surface of each theme, derived
 * from `@houston/design-tokens`. A future palette edit therefore re-derives
 * itself instead of silently shipping a name nobody can read.
 *
 * The dark surface is composited, not taken raw: `color.dark.background` is
 * glass (`rgba(38, 38, 40, 0.55)`) over the `color.dark.base` gutter, so the
 * colour the eye meets is the blend, not the token.
 *
 * Every emitted class is a COMPLETE LITERAL string in the table below —
 * Tailwind scans source text, so an interpolated class name is a class that
 * never gets generated.
 */

import { color as themeColor } from "@houston/design-tokens";
import { AGENT_COLORS, agentColorId } from "./agent-colors.ts";
import {
  contrastRatio,
  flattenColor,
  formatColor,
  parseColor,
} from "./color-contrast.ts";

/** WCAG 2.x minimum for body-size text. Below this the name falls back to ink. */
export const AGENT_NAME_CONTRAST_MIN = 4.5;

/** The class emitted when an agent colour is illegible in a given theme: the
 *  ordinary primary-text token, which is legible in both themes by definition. */
export const AGENT_NAME_FALLBACK_CLASS = "text-ink";

interface ToneVariants {
  /** Legible in both themes — the colour carries all the way through. */
  readonly both: string;
  /** Legible on light only — dark reverts to ink. */
  readonly lightOnly: string;
  /** Legible on dark only — light reverts to ink. */
  readonly darkOnly: string;
}

/**
 * Every class string this module can emit, spelled out. Read down a column to
 * see exactly what ships for a palette id in each legibility outcome.
 */
const AGENT_NAME_TONE_CLASSES = {
  charcoal: {
    both: "text-agent-charcoal",
    lightOnly: "text-agent-charcoal dark:text-ink",
    darkOnly: "text-ink dark:text-agent-charcoal",
  },
  forest: {
    both: "text-agent-forest",
    lightOnly: "text-agent-forest dark:text-ink",
    darkOnly: "text-ink dark:text-agent-forest",
  },
  navy: {
    both: "text-agent-navy",
    lightOnly: "text-agent-navy dark:text-ink",
    darkOnly: "text-ink dark:text-agent-navy",
  },
  purple: {
    both: "text-agent-purple",
    lightOnly: "text-agent-purple dark:text-ink",
    darkOnly: "text-ink dark:text-agent-purple",
  },
  crimson: {
    both: "text-agent-crimson",
    lightOnly: "text-agent-crimson dark:text-ink",
    darkOnly: "text-ink dark:text-agent-crimson",
  },
  orange: {
    both: "text-agent-orange",
    lightOnly: "text-agent-orange dark:text-ink",
    darkOnly: "text-ink dark:text-agent-orange",
  },
  golden: {
    both: "text-agent-golden",
    lightOnly: "text-agent-golden dark:text-ink",
    darkOnly: "text-ink dark:text-agent-golden",
  },
  teal: {
    both: "text-agent-teal",
    lightOnly: "text-agent-teal dark:text-ink",
    darkOnly: "text-ink dark:text-agent-teal",
  },
  rose: {
    both: "text-agent-rose",
    lightOnly: "text-agent-rose dark:text-ink",
    darkOnly: "text-ink dark:text-agent-rose",
  },
  umber: {
    both: "text-agent-umber",
    lightOnly: "text-agent-umber dark:text-ink",
    darkOnly: "text-ink dark:text-agent-umber",
  },
} as const satisfies Record<string, ToneVariants>;

/** The palette ids this module knows how to colour a name with. */
export type AgentNameToneId = keyof typeof AGENT_NAME_TONE_CLASSES;

/** Per-theme legibility of one agent colour against that theme's chat surface. */
export interface AgentNameLegibility {
  lightOk: boolean;
  darkOk: boolean;
}

/** Measured contrast of one agent colour against each theme's chat surface. */
export interface AgentNameContrast {
  light: number;
  dark: number;
}

/**
 * The opaque colour a chat bubble's text actually sits on, per theme. Light is
 * the flat screen token; dark is the glass background resolved over the gutter
 * it floats on.
 */
function nameSurface(theme: "light" | "dark"): string {
  const background = parseColor(themeColor[theme].background);
  if (background.a === 1) return formatColor(background);
  return formatColor(
    flattenColor(background, parseColor(themeColor[theme].base)),
  );
}

const LIGHT_SURFACE = nameSurface("light");
const DARK_SURFACE = nameSurface("dark");

const MEASURED: Record<string, AgentNameContrast> = Object.fromEntries(
  AGENT_COLORS.map((entry) => [
    entry.id,
    {
      light: contrastRatio(entry.light, LIGHT_SURFACE),
      dark: contrastRatio(entry.dark, DARK_SURFACE),
    },
  ]),
);

/**
 * The measured contrast ratios behind every decision this module makes, so
 * tests (and a curious reviewer) can assert the actual numbers rather than
 * trust the branch that consumed them. Returns a fresh object — the internal
 * table is the source of truth and must not be mutable from outside.
 */
export function agentNameContrast(): Record<string, AgentNameContrast> {
  return Object.fromEntries(
    Object.entries(MEASURED).map(([id, ratios]) => [id, { ...ratios }]),
  );
}

/** Whether an agent colour clears the text minimum in each theme. */
export function agentNameLegibility(id: string): AgentNameLegibility {
  const ratios = MEASURED[id];
  if (!ratios) return { lightOk: false, darkOk: false };
  return {
    lightOk: ratios.light >= AGENT_NAME_CONTRAST_MIN,
    darkOk: ratios.dark >= AGENT_NAME_CONTRAST_MIN,
  };
}

/**
 * The pure branch selection, split out so every outcome — including the ones
 * today's palette never reaches — is directly testable with injected
 * legibility instead of by mutating the palette.
 *
 * An id outside the table falls back to plain ink: the caller resolved it
 * through `agentColorId`, so this can only be reached if the token palette
 * grew a colour this table has not learned yet, and an unstyled-but-readable
 * name beats an invented class Tailwind never generated.
 */
export function nameToneClassFor(
  id: string,
  { lightOk, darkOk }: AgentNameLegibility,
): string {
  const variants = AGENT_NAME_TONE_CLASSES[id as AgentNameToneId];
  if (!variants) return AGENT_NAME_FALLBACK_CLASS;
  if (lightOk && darkOk) return variants.both;
  if (lightOk) return variants.lightOnly;
  if (darkOk) return variants.darkOnly;
  return AGENT_NAME_FALLBACK_CLASS;
}

/**
 * The text-colour class for an agent's name in chat. `stored` is whatever the
 * agent has on record — a palette id, or a light/dark hex from an older write
 * — and is resolved through `agentColorId`, so an unknown or missing value
 * lands on the first palette colour exactly like every other agent surface.
 */
export function agentNameToneClass(stored: string | undefined): string {
  const id = agentColorId(stored);
  return nameToneClassFor(id, agentNameLegibility(id));
}
