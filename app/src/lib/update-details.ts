const GENERIC_UPDATE_NOTES = new Set([
  "See the assets to download and install this version.",
]);

export function normalizeUpdateNotes(
  body: string | null | undefined,
): string | null {
  const notes = body?.replace(/\r\n/g, "\n").trim();
  if (!notes || GENERIC_UPDATE_NOTES.has(notes)) return null;
  return notes;
}
