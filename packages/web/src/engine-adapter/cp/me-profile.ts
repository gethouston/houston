import type {
  EditableProfile,
  EditableProfileUpdate,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * The caller's OWN editable display profile (name + photo): the EFFECTIVE
 * values the product renders, plus `custom` saying which of them the user set
 * by hand rather than inheriting from Google. Degrades to `null` on a gateway
 * that predates the route (404) — the Settings profile section then never
 * renders, so a pre-feature host stays byte-identical. Mirrors
 * `getOrgPeople`'s 404 swallow; every other error throws.
 */
export async function getMyProfile(
  cfg: ControlPlaneConfig,
): Promise<EditableProfile | null> {
  try {
    const res = await cpFetch(cfg, "/v1/me/profile");
    return (await res.json()) as EditableProfile;
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Update the caller's own display profile. Per key: a string sets the
 * override, `null` clears it back to the identity provider's value, an omitted
 * key leaves that field untouched. Answers the full effective profile so the
 * caller repaints from the host's truth. Deliberately WITHOUT the 404 swallow
 * above: a write that reported success on a host that never stored it is a
 * silent failure, so every status — including the 400 of a rejected name or
 * photo — reaches the caller.
 */
export async function setMyProfile(
  cfg: ControlPlaneConfig,
  update: EditableProfileUpdate,
): Promise<EditableProfile> {
  const res = await cpFetch(cfg, "/v1/me/profile", {
    method: "PUT",
    body: JSON.stringify(update),
  });
  return (await res.json()) as EditableProfile;
}
