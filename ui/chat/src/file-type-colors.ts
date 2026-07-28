/**
 * File-type accent colors for attachment chips — the colored square behind each
 * file-type glyph. These are decorative CATEGORY accents (PDF red, spreadsheet
 * green, document blue, image purple, folder blue), not theme colors and not
 * brand marks: there is no semantic `--ht-*` role for "spreadsheet green", so
 * they cannot be tokenized. Centralized here (rather than scattered as inline
 * `bg-[#...]` in JSX) following the `provider-brand-colors.ts` precedent, so the
 * "no raw hex in components" rule holds everywhere else. They are local to the
 * chat attachment chip: the Files browser (`@houston-ai/agent`) draws its own
 * glyphs monochrome, so there is nothing to keep in sync here.
 */
export const FILE_TYPE_ACCENT = {
  pdf: "#E5252A",
  sheet: "#34A853",
  doc: "#4285F4",
  image: "#9333EA",
  folder: "#54A8F0",
} as const;
