import type { ColorWord } from "./color-vocabulary";

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

const title = (tone: string) => tone.charAt(0).toUpperCase() + tone.slice(1);

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

export const PALETTE_WORDS: Record<string, ColorWord> = {
  ...AVATAR_WORDS,
  "qr-ink": {
    label: "QR ink",
    role: "The modules of a QR code. Black in every theme, because many phone scanners reject an inverted code.",
  },
  "qr-tile": {
    label: "QR tile",
    role: "The light tile a QR code sits on, in every theme, so the code keeps its contrast in dark mode.",
  },
};
