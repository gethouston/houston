/**
 * The 16px team-icon set, generated from Julian's source SVG by
 * `scripts/generate-team-icons.mjs`.
 *
 * Stored-key compatibility: keys shared by both sets resolve directly. Clear
 * renamed equivalents resolve through `LEGACY_SIDEBAR_GROUP_GLYPH_ALIASES`
 * below. Retired keys without an honest equivalent resolve to no mark, which
 * preserves the neutral team fallback instead of silently changing meaning.
 */
import { SIDEBAR_GROUP_GLYPHS_1 } from "./sidebar-group-glyph-data-1";
import { SIDEBAR_GROUP_GLYPHS_2 } from "./sidebar-group-glyph-data-2";
import { SIDEBAR_GROUP_GLYPHS_3 } from "./sidebar-group-glyph-data-3";
import { SIDEBAR_GROUP_GLYPHS_4 } from "./sidebar-group-glyph-data-4";
import { SIDEBAR_GROUP_GLYPHS_5 } from "./sidebar-group-glyph-data-5";

export const SIDEBAR_GROUP_GLYPHS = {
  ...SIDEBAR_GROUP_GLYPHS_1,
  ...SIDEBAR_GROUP_GLYPHS_2,
  ...SIDEBAR_GROUP_GLYPHS_3,
  ...SIDEBAR_GROUP_GLYPHS_4,
  ...SIDEBAR_GROUP_GLYPHS_5,
} as const;

export type SidebarGroupGlyphName = keyof typeof SIDEBAR_GROUP_GLYPHS;

export const LEGACY_SIDEBAR_GROUP_GLYPH_ALIASES = {
  people: "users",
  person: "face",
  happy: "face-flat-smile",
  sad: "unhappy-face",
  chatbubbles: "conversation",
  chatbox: "chat",
  "chatbox-ellipses": "chat-line",
  "chatbubble-ellipses": "chat-line",
  mail: "email",
  notifications: "notified",
  videocam: "video",
  headset: "sound",
  storefront: "shop",
  cash: "dollar-bill",
  business: "briefcase",
  "stats-chart": "bar-chart",
  analytics: "chart",
  time: "clock",
  timer: "stopwatch",
  plane: "airplane",
  boat: "ship",
  bicycle: "bike",
  "american-football": "american-foot-ball",
  football: "soccer-ball",
  tennisball: "tennis-ball",
  gamepad: "joystick",
  binoculars: "binocular",
  barbell: "dumbbell",
  medical: "health",
  medkit: "safety-kit",
  document: "page",
  "document-text": "text-block",
  pencil: "write",
  save: "floppy-disk",
  school: "education",
  star: "starred",
  bulb: "light-bulb",
  gear: "gears",
  "lock-closed": "small-lock",
  warning: "alert",
  "hardware-chip": "chip",
  desktop: "desktop-window",
  planet: "world",
  earth: "world",
  sunny: "sun",
  thunderstorm: "storm",
  flame: "fire",
} as const satisfies Partial<Record<string, SidebarGroupGlyphName>>;

export function resolveSidebarGroupGlyph(
  storedName: string | undefined,
): SidebarGroupGlyphName | undefined {
  if (!storedName) return undefined;
  if (Object.hasOwn(SIDEBAR_GROUP_GLYPHS, storedName)) {
    return storedName as SidebarGroupGlyphName;
  }
  return LEGACY_SIDEBAR_GROUP_GLYPH_ALIASES[
    storedName as keyof typeof LEGACY_SIDEBAR_GROUP_GLYPH_ALIASES
  ];
}
