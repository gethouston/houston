export const LEGACY_SETUP_BEGIN = "<!-- HOUSTON_SETUP_BEGIN -->";
export const LEGACY_SETUP_END = "<!-- HOUSTON_SETUP_END -->";

function stripOneSection(claudeMd: string): string {
  const beginIdx = claudeMd.indexOf(LEGACY_SETUP_BEGIN);
  if (beginIdx === -1) return claudeMd;
  const endIdx = claudeMd.indexOf(LEGACY_SETUP_END, beginIdx);
  if (endIdx === -1) return claudeMd;
  const before = claudeMd.slice(0, beginIdx).replace(/\s+$/, "");
  const after = claudeMd
    .slice(endIdx + LEGACY_SETUP_END.length)
    .replace(/^\s+/, "");
  if (!before) return after;
  if (!after) return `${before}\n`;
  return `${before}\n\n${after}`;
}

export function stripLegacySetupDirective(claudeMd: string): string {
  let current = claudeMd;
  for (;;) {
    const next = stripOneSection(current);
    if (next === current) return current;
    current = next;
  }
}
