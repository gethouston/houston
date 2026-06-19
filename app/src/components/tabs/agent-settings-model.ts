/**
 * Pure helpers for the agent Settings sub-tab. Kept dependency-free so they can
 * be unit-tested without a DOM.
 */

/**
 * Whether a pending name edit should be committed: non-empty after trimming and
 * different from the current name. Gates the on-blur / Enter rename so an empty
 * or no-op edit doesn't fire a pointless rename.
 */
export function canSaveName(current: string, draft: string): boolean {
  const trimmed = draft.trim();
  return trimmed.length > 0 && trimmed !== current;
}
