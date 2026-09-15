/**
 * The space-administration REST calls — the roster, the invitations, and the
 * roles — over the injected `fetch`.
 *
 * These are gateway-only routes (`/v1/org*`): the runtime client is scoped to
 * one agent's sandbox and serves none of them, so the module talks to them
 * through {@link httpRequest} with literal paths, which is also what keeps them
 * visible to the assistant's operation catalog.
 *
 * Nothing is swallowed here: a non-2xx always throws an {@link OrgHttpError}
 * carrying the HTTP `status`, so the `404` of a gateway that predates a route
 * reaches the caller and it — not this layer — decides whether that hides a
 * surface or is a failure. A `401` additionally fires
 * {@link HttpScope.onUnauthorized}, so a lapsed session token becomes a visible
 * `tokenExpired` signal.
 */

import { type HttpScope, httpRequest, SdkHttpError } from "../http";
import type {
  AddOrgMemberResult,
  OrgInfo,
  OrgPerson,
  OrgRole,
  UserProfilesResult,
} from "./types";

/** A failed `/v1/org*` request. `status` is the upstream HTTP status. */
export class OrgHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "OrgHttpError");
  }
}

/**
 * Shows the current space, the user's role in it, and the people in it.
 * @assistant group:org
 */
export async function getOrg(scope: HttpScope): Promise<OrgInfo> {
  const res = await httpRequest(scope, "/v1/org");
  return (await res.json()) as OrgInfo;
}

/**
 * Looks up the names and photos of people in this space.
 *
 * Display profiles (name + photo) for the given member ids — any co-member of
 * the active space (the personal space resolves only the caller). Non-co-member
 * ids are omitted server-side. An empty id list resolves without asking the
 * gateway anything. A host that predates the route answers 404 like any other
 * failure; the caller degrades that to an empty map (teammate faces then fall
 * back to initials) so a pre-feature host stays byte-identical.
 * @assistant group:org hidden: UI plumbing; resolves member ids to the names and photos the app's avatars render.
 */
export async function getOrgProfiles(
  scope: HttpScope,
  ids: string[],
): Promise<UserProfilesResult> {
  if (ids.length === 0) return { profiles: {} };
  const query = new URLSearchParams({ ids: ids.join(",") }).toString();
  const res = await httpRequest(scope, `/v1/org/profiles?${query}`);
  return (await res.json()) as UserProfilesResult;
}

/**
 * Lists the people the user shares this space with.
 *
 * The sanitized co-member directory of the active space (the personal space
 * resolves only the caller), named-first: no emails, no roles. It backs the
 * composer's @mention autocomplete and the renderer's chips. A host that
 * predates the route answers 404 like any other failure; the caller degrades
 * that to an empty list — `@` then just types plainly and no popover ever
 * opens — so a pre-feature host stays byte-identical.
 * @assistant group:org
 */
export async function getOrgPeople(scope: HttpScope): Promise<OrgPerson[]> {
  const res = await httpRequest(scope, "/v1/org/people");
  return ((await res.json()) as { people?: OrgPerson[] }).people ?? [];
}

/**
 * Invites someone to this space with the role the user chooses.
 * @param email The person's email address, as they gave it.
 * @param role What they may do in the space.
 * @assistant group:org confirm
 */
export async function addOrgMember(
  scope: HttpScope,
  email: string,
  role: OrgRole,
): Promise<AddOrgMemberResult> {
  const res = await httpRequest(scope, "/v1/org/members", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
  return (await res.json()) as AddOrgMemberResult;
}

/**
 * Cancels a pending invitation to this space.
 * @param inviteId The pending invitation to cancel, by the id getOrgPeople
 *   returns.
 * @assistant group:org confirm
 */
export async function deleteOrgInvite(
  scope: HttpScope,
  inviteId: string,
): Promise<void> {
  await httpRequest(scope, `/v1/org/invites/${encodeURIComponent(inviteId)}`, {
    method: "DELETE",
  });
}

/**
 * Removes someone from the current space.
 * @param userId The person to remove, by the user id getOrgPeople returns.
 * @assistant group:org confirm
 */
export async function removeOrgMember(
  scope: HttpScope,
  userId: string,
): Promise<void> {
  await httpRequest(scope, `/v1/org/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

/**
 * Changes what someone is allowed to do in this space.
 * @param userId The person, by the user id getOrgPeople returns.
 * @param role What they may do in the space.
 * @assistant group:org confirm
 */
export async function setOrgMemberRole(
  scope: HttpScope,
  userId: string,
  role: OrgRole,
): Promise<void> {
  await httpRequest(scope, `/v1/org/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}
