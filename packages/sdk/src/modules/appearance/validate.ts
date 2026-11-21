import { field } from "../payload";
import {
  type PaletteId,
  parsePaletteId,
  parseThemeMode,
  type ThemePreference,
} from "./model";

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

function optionalString(payload: unknown, key: string): string | null {
  const value = field(payload, key);
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`'${key}' must be a string`);
  return value;
}

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
