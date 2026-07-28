/**
 * The caller's OWN display profile (name + photo) — the state behind
 * `GET`/`PUT /v1/me/profile`.
 *
 * The gateway keeps two layers and this mirrors them: the identity provider's
 * profile (`meProfileBase`, captured from the armed roster's self row) and the
 * user's own overrides (`meProfileCustom`). What the wire serves is the
 * EFFECTIVE value — override when set, provider value otherwise — plus a
 * `custom` flag per field, which is what lets the UI offer "use my Google photo
 * again" only when there is something to revert.
 *
 * A write also REFLECTS onto the armed org roster: in production the caller's
 * new name/photo is the same record `/v1/org/people` and `/v1/org/profiles`
 * read, so a save must visibly repaint the faces everywhere — an e2e that saved
 * a name and still saw the old one on a mission card would be right to fail.
 *
 * The fields live on `HostState` (state-store.ts); this module is the read/write
 * surface, mirroring how `state-teams.ts` operates on the shared `state`.
 */

import type { FakeMember, FakeMeProfile } from "./state-store";
import { SELF_USER_ID, state } from "./state-store";

/** One profile field's effective value: the user's override, else the provider's. */
function effective(field: "displayName" | "photoUrl"): string | undefined {
  return state.meProfileCustom[field] ?? state.meProfileBase[field];
}

/**
 * The profile `GET /v1/me/profile` serves. A field with neither an override nor
 * a provider value is OMITTED rather than sent empty — the client renders
 * initials from it, and `""` would paint a blank face.
 */
export function getMyProfile(): FakeMeProfile {
  const displayName = effective("displayName");
  const photoUrl = effective("photoUrl");
  return {
    ...(displayName !== undefined ? { displayName } : {}),
    ...(photoUrl !== undefined ? { photoUrl } : {}),
    custom: {
      displayName: state.meProfileCustom.displayName !== null,
      photoUrl: state.meProfileCustom.photoUrl !== null,
    },
  };
}

/** Mirror one effective field onto the roster row, deleting it when absent. */
function reflectField(
  row: FakeMember,
  field: "displayName" | "photoUrl",
): void {
  const value = effective(field);
  if (value === undefined) delete row[field];
  else row[field] = value;
}

/**
 * Apply a `PUT /v1/me/profile` patch: a string sets the override, `null` clears
 * it back to the provider value, and a key the caller did not send leaves that
 * field untouched (the wire's three-way distinction — hence the `in` checks,
 * which `undefined` alone could not express).
 *
 * Then reflect the resulting effective values onto the armed roster's self row
 * so the directory routes serve the new profile on their very next read. No
 * roster armed (or none carrying the caller) = nothing to reflect onto.
 */
export function setMyProfileFields(patch: {
  displayName?: string | null;
  photoUrl?: string | null;
}): void {
  if ("displayName" in patch)
    state.meProfileCustom.displayName = patch.displayName ?? null;
  if ("photoUrl" in patch)
    state.meProfileCustom.photoUrl = patch.photoUrl ?? null;

  const self = state.orgMembers?.find((m) => m.userId === SELF_USER_ID);
  if (!self) return;
  reflectField(self, "displayName");
  reflectField(self, "photoUrl");
}
