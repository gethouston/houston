import type { OrgInviteSummary } from "@houston-ai/engine-client";
import { shareErrorCode } from "./share-via-team.ts";
import { orgSlugFromWorkspaceId } from "./space-id.ts";

/**
 * Pure, DOM-free logic behind the INVITEE side of C8 team invites — the
 * sidebar card that offers Accept / Decline for every pending invite addressed
 * to the caller (`GET /v1/orgs` → `invites`). Kept out of the `.tsx` so the
 * error taxonomy and the inviter-name rule unit-test under bare Node.
 *
 * The gateway is the sole enforcer: this module only decides what the user is
 * TOLD when a call comes back, never who may join.
 */

/**
 * The gateway rejections the invite card explains itself, mapped from the C8
 * `POST /v1/org-invites/:id/accept` + `DELETE /v1/org-invites/:id` codes:
 *
 * - `needs_upgrade` (403) — the team's trial ended; joining would add a seat it
 *   can't pay for. The invite STAYS: an upgrade makes it acceptable again.
 * - `already_member` (409) — the caller is in that team already (a second
 *   window, or the auto-join that runs on a brand-new account's first contact).
 *   Not a failure: the list refresh drops the row and the team is already there.
 * - `invite_not_found` (404) — revoked, already used, or addressed to another
 *   email; the gateway deliberately cannot tell those apart, so neither can we.
 * - `unknown` — anything else, which keeps the standard red bug toast.
 */
export type InviteFailure =
  | "needs_upgrade"
  | "already_member"
  | "invite_not_found"
  | "unknown";

const EXPECTED_INVITE_CODES = new Set<InviteFailure>([
  "needs_upgrade",
  "already_member",
  "invite_not_found",
]);

/** Classify an accept/decline rejection into {@link InviteFailure}. */
export function classifyInviteError(err: unknown): InviteFailure {
  const code = shareErrorCode(err);
  return code !== undefined && EXPECTED_INVITE_CODES.has(code as InviteFailure)
    ? (code as InviteFailure)
    : "unknown";
}

/**
 * True for a rejection the invite card explains with its own plain
 * informational toast. `call()` silences these (no red bug toast, no Sentry
 * report) so each one gets exactly ONE surface; every other failure keeps the
 * standard toast + report path.
 */
export function isExpectedInviteError(err: unknown): boolean {
  return classifyInviteError(err) !== "unknown";
}

/**
 * The inviter as something a human can read, or `null` when we only hold an
 * opaque handle.
 *
 * `OrgInviteSummary.invitedBy` is the INVITER'S USER ID on the shipped gateway
 * (`principal.UserID`, `cloud/internal/edge/spaces_routes.go`), and the invitee
 * is not a member of that org yet, so no roster read can resolve it — the
 * profile route is scoped to co-members of the ACTIVE space. Rendering the raw
 * value would put a database id in front of a non-technical user, so the card
 * falls back to naming the TEAM alone.
 *
 * The email/display-name shape is accepted here on purpose: the moment the
 * gateway sends something human (an email, a display name), the card names the
 * inviter with no client change. An id-looking value never leaks through.
 */
export function inviterDisplayName(
  invitedBy: string | undefined,
): string | null {
  const value = invitedBy?.trim();
  if (!value) return null;
  if (value.includes("@")) return value;
  // A bare token with no whitespace is a handle (uid / sub), not a name.
  return /\s/.test(value) ? value : null;
}

/**
 * Stable order for the invite cards: by team name, then id. The gateway returns
 * invites in store order, which can shuffle between polls; a card whose Accept
 * button moves under the cursor is a misclick waiting to happen.
 */
export function sortInvites(
  invites: readonly OrgInviteSummary[],
): OrgInviteSummary[] {
  return [...invites].sort(
    (a, b) => a.orgName.localeCompare(b.orgName) || a.id.localeCompare(b.id),
  );
}

/**
 * The invites the sidebar may actually render, gated on the deployment serving
 * Spaces at all.
 *
 * Gating the FETCH is not enough: disabling a React Query leaves its cached
 * data in place, so a session that loses the capability (an identity change
 * into a non-spaces deployment, a capabilities refetch that drops `spaces`)
 * would keep painting the last fetch's invites, and acting on one would reach a
 * mutator that throws off-cloud. `hasSpaces(null)` is also false while
 * capabilities are in flight, so this doubles as the no-flash-on-load rule.
 */
export function visibleInvites(
  spacesEnabled: boolean,
  invites: readonly OrgInviteSummary[],
): OrgInviteSummary[] {
  return spacesEnabled ? sortInvites(invites) : [];
}

/**
 * True once the just-joined team is really in the switcher, i.e. the workspace
 * list holds its `org:<slug>` row.
 *
 * The workspace store's `loadWorkspaces()` resolves whether or not the reload
 * worked (it swallows the failure into a `loadError` flag), so awaiting it
 * proves nothing. Telling a user "switch to it from the space menu" off that
 * bare await is a promise we cannot keep; this is the check that earns it.
 */
export function teamIsInSwitcher(
  workspaces: readonly { id: string }[],
  slug: string,
): boolean {
  return workspaces.some((w) => orgSlugFromWorkspaceId(w.id) === slug);
}

/**
 * A one-action-at-a-time lock, keyed by invite id.
 *
 * Accept and Decline are separate mutations behind separate `AsyncButton`s, and
 * that component's rage-click guard is per BUTTON: a rapid Accept then Decline
 * inside the same frame passed both guards and fired both requests. Whichever
 * lost the race came back `already_member` / `invite_not_found` and toasted a
 * confusing state at a user who did nothing wrong. `claim` flips a plain Set
 * SYNCHRONOUSLY, before either mutation starts, so the second click is a
 * no-op; `release` in a `finally` keeps a failed action retryable.
 */
export interface InviteActionLock {
  /** Take the invite's single action slot. `false` = an action is in flight. */
  claim(inviteId: string): boolean;
  /** Give the slot back (safe to call for an id that was never claimed). */
  release(inviteId: string): void;
}

export function createInviteActionLock(): InviteActionLock {
  const inFlight = new Set<string>();
  return {
    claim(inviteId) {
      if (inFlight.has(inviteId)) return false;
      inFlight.add(inviteId);
      return true;
    },
    release(inviteId) {
      inFlight.delete(inviteId);
    },
  };
}
