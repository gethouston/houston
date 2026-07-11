import type { AgentMoveStatus, OrgSummary } from "@houston-ai/engine-client";

/**
 * Pure, DOM-free state machine behind {@link ShareViaTeamFlow} — the
 * "share a personal agent" pipeline (C8 §Share-triggers-team). Kept out of the
 * `.tsx` so every transition and failure edge unit-tests under bare Node.
 *
 * The pipeline is SEQUENTIAL and resumable, NOT independently retryable calls:
 *   pick-or-create team -> confirm -> move (poll to terminal) -> switch active
 *   space to the team -> invite teammates -> done.
 *
 * PIPELINE ORDER IS LAW (contract §Share-triggers-team): a teammate invite
 * (`addOrgMember`) must NEVER fire before the move reaches `done`. Inviting
 * earlier is what could start a trial on a team whose agent move then fails.
 * {@link assertInviteReady} encodes that rule for the wiring layer, and the
 * only transition that produces the `invite` step is a completed switch, which
 * is itself only reachable from a `done` move poll.
 */

/**
 * Move failure taxonomy, mapped from the C8 move error codes (both the
 * `POST /move` rejection body and the poll `{status:"failed", error}`), plus the
 * client-synthesized `timeout`. `unmovable_volume` is terminal for this team (no
 * retry — contact support); the rest allow a bounded retry of the move.
 */
export type MoveErrorKind =
  | "unsupported_move"
  | "unmovable_volume"
  | "needs_upgrade"
  | "timeout"
  | "unknown";

/**
 * Best-effort machine-readable reason from a gateway error (kind > code > body).
 * Shared by the wiring layer (to classify a rejection) and
 * {@link isExpectedShareError} (to silence expected C8 states from the generic
 * bug toast). Pure + DOM-free so it stays in this unit-tested module.
 */
export function shareErrorCode(err: unknown): string | undefined {
  const e = err as
    | { kind?: unknown; code?: unknown; body?: { error?: unknown } }
    | null
    | undefined;
  if (typeof e?.kind === "string") return e.kind;
  if (typeof e?.code === "string") return e.code;
  const bodyError = e?.body?.error;
  if (typeof bodyError === "string") return bodyError;
  const nested = (bodyError as { code?: unknown } | undefined)?.code;
  return typeof nested === "string" ? nested : undefined;
}

/**
 * The C8 rejection codes the share flow renders INLINE (a `MoveFailedStep` or an
 * `InviteBadge`), which are expected, user-actionable business states — NOT
 * Houston bugs: the three move rejections plus the invite `already_member`.
 * `call()` silences these (no red bug toast, no Sentry) so the inline surface is
 * the only one; every other failure keeps the generic toast + report.
 */
const EXPECTED_SHARE_CODES = new Set([
  "unsupported_move",
  "unmovable_volume",
  "needs_upgrade",
  "already_member",
]);

/** True for a gateway error the share flow explains inline (see above). */
export function isExpectedShareError(err: unknown): boolean {
  const code = shareErrorCode(err);
  return code !== undefined && EXPECTED_SHARE_CODES.has(code);
}

/**
 * Wall-clock ceiling for the `moving` poll. The `moving` step is non-dismissable
 * (a half-completed move must not be abandoned), so a gateway move that never
 * reaches a terminal status would otherwise trap the user on an un-closable
 * spinner; {@link moveTimedOut} converts a spent budget into a closable
 * `moveFailed`. ~5 min matches the cold-boot pod stop/start budget (C8).
 */
export const MOVE_POLL_TIMEOUT_MS = 5 * 60 * 1_000;

/** A team space the agent can move into, identified by its 16-hex slug. */
export interface TeamRef {
  slug: string;
  name: string;
}

/** Per-email invite tracking so a partial failure retries only its own rows. */
export type InviteStatus = "pending" | "sending" | "sent" | "failed";
export interface EmailInvite {
  email: string;
  status: InviteStatus;
  error?: string;
}

/**
 * The flow's discriminated state. `moving` and `switching` disable dismiss
 * ({@link isDismissable}); `switching` is an explicit step so the active-space
 * switch that MUST precede any invite is visible in the machine, not hidden in
 * an effect.
 */
export type ShareViaTeamState =
  | { step: "pick"; creating: boolean; createError: string | null }
  | { step: "confirm"; team: TeamRef }
  | { step: "moving"; team: TeamRef; moveId: string }
  | { step: "moveFailed"; team: TeamRef; error: MoveErrorKind }
  | { step: "switching"; team: TeamRef }
  | { step: "switchFailed"; team: TeamRef }
  | { step: "invite"; team: TeamRef; invites: EmailInvite[] }
  | { step: "done"; team: TeamRef };

/** The resting state: choosing or creating a team. */
export function initialState(): ShareViaTeamState {
  return { step: "pick", creating: false, createError: null };
}

/** The teams a user may move an agent INTO: owner/admin of a team space. */
export function ownableTeams(orgs: readonly OrgSummary[]): TeamRef[] {
  return orgs
    .filter(
      (o) => o.kind === "team" && (o.role === "owner" || o.role === "admin"),
    )
    .map((o) => ({ slug: o.slug, name: o.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Enter the "creating a team" sub-state (only meaningful from `pick`). */
export function startCreate(s: ShareViaTeamState): ShareViaTeamState {
  if (s.step !== "pick") return s;
  return { step: "pick", creating: true, createError: null };
}

/** Create failed: surface the message, allow another attempt from `pick`. */
export function createFailed(
  s: ShareViaTeamState,
  message: string,
): ShareViaTeamState {
  if (s.step !== "pick") return s;
  return { step: "pick", creating: false, createError: message };
}

/**
 * Reconcile a lost `POST /v1/orgs` response before blind-retrying (contract:
 * create is NOT idempotent). The creator becomes `owner`, so a matching
 * owner-role team by name is the one we just created — return it; otherwise
 * `null` and the caller may retry the create.
 */
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

/** A team was picked or created: advance to the confirm step. */
export function pickTeam(team: TeamRef): ShareViaTeamState {
  return { step: "confirm", team };
}

/** The move was accepted (`202 {moveId}`): begin polling. */
export function startMove(
  s: ShareViaTeamState,
  moveId: string,
): ShareViaTeamState {
  if (s.step !== "confirm" && s.step !== "moveFailed") return s;
  return { step: "moving", team: s.team, moveId };
}

/** Map a C8 move error code (rejection or poll `error`) to its kind. */
export function classifyMoveError(
  code: string | null | undefined,
): MoveErrorKind {
  switch (code) {
    case "unsupported_move":
    case "unmovable_volume":
    case "needs_upgrade":
      return code;
    default:
      return "unknown";
  }
}

/** The move POST was rejected before a ticket existed (403/409). */
export function moveRejected(
  s: ShareViaTeamState,
  code: string | null | undefined,
): ShareViaTeamState {
  if (s.step !== "confirm" && s.step !== "moveFailed") return s;
  return { step: "moveFailed", team: s.team, error: classifyMoveError(code) };
}

/**
 * Fold a move-status poll into the machine. `moving` stays put; `done` advances
 * to the explicit `switching` step (the active-space switch that must precede
 * any invite); `failed` lands on `moveFailed` with the classified error.
 */
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

/** Retry a failed move (keeps the team; forbidden for `unmovable_volume`). */
export function canRetryMove(s: ShareViaTeamState): boolean {
  return s.step === "moveFailed" && s.error !== "unmovable_volume";
}

/**
 * The `moving` poll exceeded its wall-clock budget. The `moving` step is
 * non-dismissable, so a gateway move that never reaches `done`/`failed` would
 * otherwise strand the user on an un-closable spinner. Surface a closable
 * `moveFailed("timeout")` they can retry or dismiss (the server-side move keeps
 * running and is resumable, per the contract). No-op off the `moving` step.
 */
export function moveTimedOut(s: ShareViaTeamState): ShareViaTeamState {
  if (s.step !== "moving") return s;
  return { step: "moveFailed", team: s.team, error: "timeout" };
}

/** The active-space switch finished: open the invite step (empty roster). */
export function switchDone(s: ShareViaTeamState): ShareViaTeamState {
  if (s.step !== "switching") return s;
  return { step: "invite", team: s.team, invites: [] };
}

/**
 * The active-space switch failed (the just-moved team isn't in the reloaded
 * workspace list). The move already succeeded, so we must NOT advance to
 * `invite` — inviting now would target the still-personal active space and every
 * add would 403 `personal_space`. Surface a closable `switchFailed` the user can
 * retry (re-run the switch) or dismiss. No-op off the `switching` step.
 */
export function switchFailed(s: ShareViaTeamState): ShareViaTeamState {
  if (s.step !== "switching") return s;
  return { step: "switchFailed", team: s.team };
}

/** Re-attempt the active-space switch after it failed. No-op off `switchFailed`. */
export function retrySwitch(s: ShareViaTeamState): ShareViaTeamState {
  if (s.step !== "switchFailed") return s;
  return { step: "switching", team: s.team };
}

/**
 * The pipeline-order guard: throws unless the move has completed and the space
 * has switched (i.e. we are on the `invite` step). Call before `addOrgMember`.
 */
export function assertInviteReady(s: ShareViaTeamState): void {
  if (s.step !== "invite") {
    throw new Error(
      `share-via-team: invite attempted in step "${s.step}" before move+switch completed`,
    );
  }
}

/** Add emails to the invite roster as `pending`, de-duped against existing. */
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

/** Invites that still need sending: never-sent `pending` plus retried `failed`. */
export function sendableInvites(
  invites: readonly EmailInvite[],
): EmailInvite[] {
  return invites.filter((i) => i.status === "pending" || i.status === "failed");
}

/** Finish the flow (invites are best-effort; the move already succeeded). */
export function finish(s: ShareViaTeamState): ShareViaTeamState {
  if (s.step !== "invite") return s;
  return { step: "done", team: s.team };
}

/** May the dialog be dismissed? Never mid-move or mid-switch (no half state). */
export function isDismissable(s: ShareViaTeamState): boolean {
  return s.step !== "moving" && s.step !== "switching";
}
