import type { AgentMoveStatus, OrgSummary } from "@houston/engine-adapter";
import {
  canRetryMoveError,
  classifyMoveError,
  isMoveAlreadyDone,
  type MoveErrorKind,
} from "@houston/sdk";
import { inviteSendable } from "./invite-seat-refusal";

export const MOVE_POLL_TIMEOUT_MS = 5 * 60 * 1_000;

export interface TeamRef {
  slug: string;
  name: string;
  personal?: boolean;
}

export type InviteStatus = "pending" | "sending" | "sent" | "failed";
export interface EmailInvite {
  email: string;
  status: InviteStatus;
  error?: string;
}

export type ShareViaTeamState =
  | { step: "pick"; creating: boolean; createError: string | null }
  | { step: "confirm"; team: TeamRef }
  | { step: "moving"; team: TeamRef; moveId: string }
  | { step: "moveFailed"; team: TeamRef; error: MoveErrorKind }
  | { step: "switching"; team: TeamRef }
  | { step: "switchFailed"; team: TeamRef }
  | { step: "invite"; team: TeamRef; invites: EmailInvite[] }
  | { step: "done"; team: TeamRef };

export function initialState(): ShareViaTeamState {
  return { step: "pick", creating: false, createError: null };
}

export function ownableTeams(orgs: readonly OrgSummary[]): TeamRef[] {
  return orgs
    .filter(
      (o) => o.kind === "team" && (o.role === "owner" || o.role === "admin"),
    )
    .map((o) => ({ slug: o.slug, name: o.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function startCreate(s: ShareViaTeamState): ShareViaTeamState {
  if (s.step !== "pick") return s;
  return { step: "pick", creating: true, createError: null };
}

export function createFailed(
  s: ShareViaTeamState,
  message: string,
): ShareViaTeamState {
  if (s.step !== "pick") return s;
  return { step: "pick", creating: false, createError: message };
}

export function reconcileCreatedTeam(
  orgs: readonly OrgSummary[],
  name: string,
): TeamRef | null {
  const wanted = name.trim().toLowerCase();
  const hit = orgs.find(
    (o) =>
      o.kind === "team" &&
      o.role === "owner" &&
      o.name.trim().toLowerCase() === wanted,
  );
  return hit ? { slug: hit.slug, name: hit.name } : null;
}

export function pickTeam(team: TeamRef): ShareViaTeamState {
  return { step: "confirm", team };
}

export function startMove(
  s: ShareViaTeamState,
  moveId: string,
): ShareViaTeamState {
  if (s.step !== "confirm" && s.step !== "moveFailed") return s;
  return { step: "moving", team: s.team, moveId };
}

export function moveRejected(
  s: ShareViaTeamState,
  code: string | null | undefined,
): ShareViaTeamState {
  if (s.step !== "confirm" && s.step !== "moveFailed") return s;
  if (isMoveAlreadyDone(code)) return { step: "switching", team: s.team };
  return { step: "moveFailed", team: s.team, error: classifyMoveError(code) };
}

export function applyMovePoll(
  s: ShareViaTeamState,
  status: AgentMoveStatus,
): ShareViaTeamState {
  if (s.step !== "moving") return s;
  switch (status.status) {
    case "moving":
      return s;
    case "done":
      return { step: "switching", team: s.team };
    case "failed":
      return {
        step: "moveFailed",
        team: s.team,
        error: classifyMoveError(status.error),
      };
  }
}

export function canRetryMove(s: ShareViaTeamState): boolean {
  return s.step === "moveFailed" && canRetryMoveError(s.error);
}

export function moveTimedOut(s: ShareViaTeamState): ShareViaTeamState {
  if (s.step !== "moving") return s;
  return { step: "moveFailed", team: s.team, error: "timeout" };
}

export function switchDone(s: ShareViaTeamState): ShareViaTeamState {
  if (s.step !== "switching") return s;
  if (s.team.personal) return { step: "done", team: s.team };
  return { step: "invite", team: s.team, invites: [] };
}

export function switchFailed(s: ShareViaTeamState): ShareViaTeamState {
  if (s.step !== "switching") return s;
  return { step: "switchFailed", team: s.team };
}

export function retrySwitch(s: ShareViaTeamState): ShareViaTeamState {
  if (s.step !== "switchFailed") return s;
  return { step: "switching", team: s.team };
}

export function assertInviteReady(s: ShareViaTeamState): void {
  if (s.step !== "invite") {
    throw new Error(
      `share-via-team: invite attempted in step "${s.step}" before move+switch completed`,
    );
  }
}

export function addInviteEmails(
  invites: readonly EmailInvite[],
  emails: readonly string[],
): EmailInvite[] {
  const seen = new Set(invites.map((i) => i.email.toLowerCase()));
  const next = [...invites];
  for (const raw of emails) {
    const email = raw.trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    next.push({ email, status: "pending" });
  }
  return next;
}

function setInvite(
  invites: readonly EmailInvite[],
  email: string,
  patch: Partial<EmailInvite>,
): EmailInvite[] {
  return invites.map((i) => (i.email === email ? { ...i, ...patch } : i));
}

export function markInviteSending(
  invites: readonly EmailInvite[],
  email: string,
): EmailInvite[] {
  return setInvite(invites, email, { status: "sending", error: undefined });
}

export function markInviteSent(
  invites: readonly EmailInvite[],
  email: string,
): EmailInvite[] {
  return setInvite(invites, email, { status: "sent", error: undefined });
}

export function markInviteFailed(
  invites: readonly EmailInvite[],
  email: string,
  error: string,
): EmailInvite[] {
  return setInvite(invites, email, { status: "failed", error });
}

export function sendableInvites(
  invites: readonly EmailInvite[],
): EmailInvite[] {
  return invites.filter(inviteSendable);
}

export function finish(s: ShareViaTeamState): ShareViaTeamState {
  if (s.step !== "invite") return s;
  return { step: "done", team: s.team };
}

export function isDismissable(s: ShareViaTeamState): boolean {
  return s.step !== "moving" && s.step !== "switching";
}
