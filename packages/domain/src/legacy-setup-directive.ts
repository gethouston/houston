/**
 * The section earlier builds wrote into an AI Employee's CLAUDE.md between
 * these markers: the retired onboarding's "send ONE real email now" directive.
 * Its flow stripped it again only when it ended, so one that outlived its flow
 * still tells the AI Employee to send an email on its next session. Nothing
 * writes the section any more; the markers are the ones already on disk.
 */
export const LEGACY_SETUP_BEGIN = "<!-- HOUSTON_SETUP_BEGIN -->";
export const LEGACY_SETUP_END = "<!-- HOUSTON_SETUP_END -->";

/** Remove the first complete marked section, or return the text unchanged. */
function stripOneSection(claudeMd: string): string {
  const beginIdx = claudeMd.indexOf(LEGACY_SETUP_BEGIN);
  if (beginIdx === -1) return claudeMd;
  const endIdx = claudeMd.indexOf(LEGACY_SETUP_END, beginIdx);
  // A begin with no end is not a section this code wrote whole: leaving it is
  // safer than guessing where the user's own text resumes.
  if (endIdx === -1) return claudeMd;
  const before = claudeMd.slice(0, beginIdx).replace(/\s+$/, "");
  const after = claudeMd
    .slice(endIdx + LEGACY_SETUP_END.length)
    .replace(/^\s+/, "");
  if (!before) return after;
  if (!after) return `${before}\n`;
  return `${before}\n\n${after}`;
}

/**
 * Remove every legacy setup section from a CLAUDE.md. Idempotent: a file with
 * none comes back as the same string, so a caller writes only on a change.
 */
export function stripLegacySetupDirective(claudeMd: string): string {
  let current = claudeMd;
  for (;;) {
    const next = stripOneSection(current);
    if (next === current) return current;
    current = next;
  }
}
