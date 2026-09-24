/**
 * What a patch has to be before anything is written: the mode is one this build
 * runs, and a palette belongs to the mode it is picked for.
 *
 * Both callers narrow through here — the typed facade (where `light` and `dark`
 * are both `PaletteId`, so the compiler cannot tell a dark id picked for light
 * apart from a valid one) and `dispatch` (where every field arrives as untrusted
 * JSON). One refusal, one message, whichever side the patch came from.
 */

import { field } from "../payload";
import {
  type PaletteId,
  parsePaletteId,
  parseThemeMode,
  type ThemePreference,
} from "./model";

/**
 * A patch naming an appearance this build cannot wear: an unknown id, or a
 * palette of the other mode (a dark palette under `light` would paint dark
 * colours in light mode).
 *
 * It throws rather than correcting the value: every picker offers exactly what
 * `listPalettes` returns, so a refused patch is a caller bug or a stale dispatch,
 * and quietly saving a corrected pick would leave the user looking at an
 * appearance nobody chose.
 */
export class InvalidThemeError extends Error {
  readonly field: keyof ThemePreference;
  readonly value: string;
  constructor(field: keyof ThemePreference, value: string) {
    super(`"${value}" is not an appearance this build ships for "${field}"`);
    this.name = "InvalidThemeError";
    this.field = field;
    this.value = value;
  }
}

/** An optional string off an untrusted command payload. */
function optionalString(payload: unknown, key: string): string | null {
  const value = field(payload, key);
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`'${key}' must be a string`);
  return value;
}

/** Refuse a typed patch that names a mode or palette this build cannot wear. */
export function validatePatch(patch: Partial<ThemePreference>): void {
  if (patch.mode !== undefined && parseThemeMode(patch.mode) === null) {
    throw new InvalidThemeError("mode", patch.mode);
  }
  for (const side of ["light", "dark"] as const) {
    const id: PaletteId | undefined = patch[side];
    if (id !== undefined && parsePaletteId(id, side) === null) {
      throw new InvalidThemeError(side, id);
    }
  }
}

/**
 * A dispatched patch, narrowed to the vocabulary before anything is written. A
 * field that is absent is left alone; a field that is present and unusable is
 * refused, never dropped — a caller that asked for an appearance we cannot wear
 * has to hear so.
 */
export function patchFromPayload(payload: unknown): Partial<ThemePreference> {
  const patch: Partial<ThemePreference> = {};
  const mode = optionalString(payload, "mode");
  if (mode !== null) {
    const parsed = parseThemeMode(mode);
    if (parsed === null) throw new InvalidThemeError("mode", mode);
    patch.mode = parsed;
  }
  for (const side of ["light", "dark"] as const) {
    const raw = optionalString(payload, side);
    if (raw === null) continue;
    const parsed = parsePaletteId(raw, side);
    if (parsed === null) throw new InvalidThemeError(side, raw);
    patch[side] = parsed;
  }
  return patch;
}
