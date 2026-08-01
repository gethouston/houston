import type { ColorWord } from "./color-vocabulary";

/** The seven agent helmet tones, and the five desaturated teammate tones. */
const AGENT_TONES = [
  "charcoal",
  "forest",
  "navy",
  "purple",
  "crimson",
  "orange",
  "golden",
];
const PERSON_TONES = ["slate", "sage", "mauve", "taupe", "indigo"];

/** `charcoal` → `Charcoal`. */
const title = (tone: string) => tone.charAt(0).toUpperCase() + tone.slice(1);

/**
 * The avatar families are generated rather than typed out one by one: every
 * member of a family does the same job, and the tone name IS the difference.
 * Writing seven near-identical sentences by hand only invites them to drift.
 */
const AVATAR_WORDS: Record<string, ColorWord> = {
  ...Object.fromEntries(
    AGENT_TONES.map((tone) => [
      `agent-${tone}`,
      {
        label: `Agent ${tone}`,
        role: `${title(tone)}: one of the seven agent helmet tones. An agent keeps its tone everywhere it appears, so the colour reads as identity.`,
      },
    ]),
  ),
  ...Object.fromEntries(
    PERSON_TONES.flatMap((tone) => [
      [
        `person-${tone}`,
        {
          label: `Teammate ${tone}`,
          role: `${title(tone)}: one of the five teammate avatar fills, picked by hashing the person's id. Deliberately desaturated so a face never competes with an agent helmet.`,
        },
      ],
      [
        `person-name-${tone}`,
        {
          label: `Teammate name ${tone}`,
          role: `${title(tone)}, darkened: the tone a teammate's NAME is set in, so it still passes contrast on a light surface.`,
        },
      ],
    ]),
  ),
  "person-initials": {
    label: "Teammate initials",
    role: "The initials drawn on a teammate's avatar, on every one of the five fills.",
  },
  "person-overflow": {
    label: "Teammate overflow",
    role: 'The "+N" chip that closes a face stack once it runs out of room.',
  },
  "person-overflow-text": {
    label: "Teammate overflow ink",
    role: 'The count inside that "+N" chip.',
  },
};

/** Avatar families exactly one feature owns. */
export const PALETTE_WORDS: Record<string, ColorWord> = {
  ...AVATAR_WORDS,
};
