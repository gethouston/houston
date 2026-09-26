import { sidebarGroupNameTooLong } from "@houston/protocol";

/**
 * The pure half of the "Icon & Name" form: what a Save WRITES, and the ONE
 * name-length rule both dialogs (create and edit) validate with. Free of ui
 * barrels on purpose — this is exactly the logic the node:test suite pins.
 */

/** Checked on the trimmed name, which is what a Save stores. */
export function teamNameTooLong(name: string): boolean {
  return sidebarGroupNameTooLong(name.trim());
}

/** What the "Change icon & name" form holds: the team's identity as the user
 *  sees and edits it. `undefined` icon/colour = the neutral default. */
export interface TeamIdentityDraft {
  name: string;
  icon: string | undefined;
  colorId: string | undefined;
}

/** Save only identity fields the person changed in the form. */
export function teamIdentitySaveWrites(
  seeded: TeamIdentityDraft,
  draft: TeamIdentityDraft,
): {
  rename?: string;
  patch?: { icon?: string | null; color?: string | null };
} {
  const trimmed = draft.name.trim();
  const patch = {
    ...(draft.icon !== seeded.icon ? { icon: draft.icon ?? null } : {}),
    ...(draft.colorId !== seeded.colorId
      ? { color: draft.colorId ?? null }
      : {}),
  };
  return {
    ...(trimmed && trimmed !== seeded.name ? { rename: trimmed } : {}),
    ...(Object.keys(patch).length > 0 ? { patch } : {}),
  };
}
