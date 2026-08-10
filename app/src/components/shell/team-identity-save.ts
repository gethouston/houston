import { TEAM_NAME_MAX_RUNES } from "../team-view/team-members-model.ts";

/**
 * The pure half of the "Icon & Name" form: what a Save WRITES, and the ONE
 * name-length rule both dialogs (create and edit) validate with. Free of ui
 * barrels on purpose — this is exactly the logic the node:test suite pins.
 */

/** The gateway's own ceiling, counted in RUNES like the gateway counts it. */
export function teamNameTooLong(name: string): boolean {
  return Array.from(name.trim()).length > TEAM_NAME_MAX_RUNES;
}

/** What the "Change icon & name" form holds: the team's identity as the user
 *  sees and edits it. `undefined` icon/colour = the neutral default. */
export interface TeamIdentityDraft {
  name: string;
  icon: string | undefined;
  colorId: string | undefined;
}

/**
 * The writes a Save performs: a DIFF of the draft against what the form was
 * SEEDED with — never against the live team, whose fields a teammate may have
 * moved while the dialog was open (clobbering their edit with a stale copy of
 * an untouched field would be the dialog's fault, not the user's).
 *
 * A deselected icon or colour becomes an explicit `null` (the wire's spelling
 * of "clear"), which is how the picker's toggle-off keeps the old "Default"
 * reset's power. An identity half that seeded `undefined` and stayed there is
 * OMITTED, not cleared: a server team may store a raw colour this palette
 * cannot name, and an untouched form must never wipe it.
 */
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
