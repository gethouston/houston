import { color as themeColor } from "@houston/design-tokens";
import { AGENT_COLORS, agentColorId } from "./agent-colors.ts";
import {
  contrastRatio,
  flattenColor,
  formatColor,
  parseColor,
} from "./color-contrast.ts";

export const AGENT_NAME_CONTRAST_MIN = 4.5;

export const AGENT_NAME_FALLBACK_CLASS = "text-ink";

interface ToneVariants {
  readonly both: string;
  readonly lightOnly: string;
  readonly darkOnly: string;
}

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

export type AgentNameToneId = keyof typeof AGENT_NAME_TONE_CLASSES;

export interface AgentNameLegibility {
  lightOk: boolean;
  darkOk: boolean;
}

export interface AgentNameContrast {
  light: number;
  dark: number;
}

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

export function agentNameContrast(): Record<string, AgentNameContrast> {
  return Object.fromEntries(
    Object.entries(MEASURED).map(([id, ratios]) => [id, { ...ratios }]),
  );
}

export function agentNameLegibility(id: string): AgentNameLegibility {
  const ratios = MEASURED[id];
  if (!ratios) return { lightOk: false, darkOk: false };
  return {
    lightOk: ratios.light >= AGENT_NAME_CONTRAST_MIN,
    darkOk: ratios.dark >= AGENT_NAME_CONTRAST_MIN,
  };
}

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

export function agentNameToneClass(stored: string | undefined): string {
  const id = agentColorId(stored);
  return nameToneClassFor(id, agentNameLegibility(id));
}
