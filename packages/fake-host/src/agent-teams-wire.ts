/**
 * The C13 wire vocabulary: what the teams routes SERVE and what they REFUSE
 * with. The stored world is `state-agent-teams.ts`; this module is the only
 * place that turns it into the caller's view.
 *
 * Two contract rules live here rather than in the routes, because they are
 * answers about the CALLER and must read the same way everywhere:
 *  - the EFFECTIVE fields (`owner`, `joined`, `memberCount`) are resolved, never
 *    raw rows, so an org owner/admin owns every team without a row existing and
 *    everyone is joined to the default one;
 *  - `agentSlugs` is an agent LISTING, so it obeys the same C7 v2 role matrix
 *    `GET /agents` obeys. A team is a grouping, never a grant, and it must not
 *    become a side channel onto the space's full agent roster.
 */

import { json, noContent } from "./http";
import {
  agentTeamMemberRows,
  listAgentTeamRows,
  teamIdOfAgent,
} from "./state-agent-teams";
import type { CpAgent, FakeAgentTeam } from "./state-store";
import { emitDomain, SELF_USER_ID, state } from "./state-store";

/** The wire shape of one team (`AgentTeam` in `@houston-ai/engine-client`). */
export interface AgentTeamWire extends FakeAgentTeam {
  agentSlugs: string[];
  memberCount: number;
  joined: boolean;
  owner: boolean;
  /** ALWAYS served, `""` when unwritten — see {@link FakeAgentTeam.context}. */
  context: string;
}

/**
 * The caller's EFFECTIVE ownership of one team: an org `owner`/`admin` owns
 * every team implicitly, and anyone else owns the teams they hold an
 * `owner: true` row on. The advertised role defaults to `owner`, as everywhere
 * else in this fake.
 */
export function isEffectiveTeamOwner(teamId: string): boolean {
  const role = state.capabilities.role ?? "owner";
  if (role === "owner" || role === "admin") return true;
  return agentTeamMemberRows(teamId).some(
    (m) => m.userId === SELF_USER_ID && m.owner,
  );
}

/**
 * Whether a user id is in the ORG at all — the `400 not_a_member` gate. With no
 * roster armed, `GET /v1/org` synthesizes the single-self one, and that IS this
 * space's membership list: only the caller is in it, so a spec promoting
 * somebody else must arm `/__test__/org` first, exactly as production requires
 * the person to actually be there.
 */
export function isOrgMember(userId: string): boolean {
  const members = state.orgMembers;
  return members
    ? members.some((m) => m.userId === userId)
    : userId === SELF_USER_ID;
}

/**
 * The agents the CALLER may see: an org `owner` sees every agent in the space;
 * an `admin` and a `user` see only the agents assigned to them (implicit TEAM
 * ownership never widens AGENT visibility). An agent with no `assignments` is
 * the single-player wire shape and an empty one is the everyone sentinel
 * (`state-agents.ts`); both are visible to everybody.
 */
function visibleAgents(): CpAgent[] {
  const role = state.capabilities.role ?? "owner";
  if (role === "owner") return state.agents;
  return state.agents.filter(
    (a) =>
      a.assignments === undefined ||
      a.assignments.length === 0 ||
      a.assignments.some((x) => x.userId === SELF_USER_ID),
  );
}

/**
 * One team as the wire serves it. `memberCount` on the DEFAULT team is the
 * SPACE's member count (everyone is in it and it holds no rows, so `len(rows)`
 * would print `0` beside `joined: true`); elsewhere it is the explicit rows.
 */
export function agentTeamWire(team: FakeAgentTeam): AgentTeamWire {
  const rows = agentTeamMemberRows(team.id);
  return {
    // The spread is what keeps §Team identity honest with no work: `icon` and
    // `color` are absent from a row that has none, so they are absent from the
    // wire too — never `""`, and never an explicit `undefined` key. Verified:
    // nothing below reintroduces them.
    ...team,
    // `context` is the one field that does NOT follow that rule: it is a text
    // column with an empty default, so a gateway that HAS it serves it for
    // every team. Omitting it for an unwritten one would tell the client this
    // gateway predates the column and make the editor vanish.
    context: team.context ?? "",
    agentSlugs: visibleAgents()
      .filter((a) => teamIdOfAgent(a.id) === team.id)
      .map((a) => a.id),
    memberCount: team.isDefault ? (state.orgMembers?.length ?? 1) : rows.length,
    joined: team.isDefault || rows.some((m) => m.userId === SELF_USER_ID),
    owner: isEffectiveTeamOwner(team.id),
  };
}

/**
 * `GET /v1/org/teams` — the teams the CALLER IS PART OF, never the space's team
 * directory (C13 §Team visibility). This is the SERVER half of "a member sees
 * only the teams they are in": the client no longer partitions joined from
 * unjoined and offers nothing to browse, because there is no directory to
 * browse. Four clauses, over the already-projected row so the filter cannot
 * drift from the fields it ships:
 *  - org `owner`/`admin` see EVERY team — they own all of them implicitly, so a
 *    team hidden from them would be one nobody could administer;
 *  - `joined` covers both the explicit membership row (the team they were put
 *    in) and the default team (everyone is in the catch-all, so no member's
 *    list is ever empty);
 *  - a non-empty `agentSlugs` is the team holding an agent the caller may see —
 *    an assigned agent must never orphan off the rail because somebody filed it
 *    into a team its assignee is not in.
 *
 * It only DROPS rows, so the order is the `(sortOrder, …)` order it always was,
 * and a team kept by the agent clause alone still reads `joined: false` —
 * visible, not subscribed. There is no personal-space branch: that space's sole
 * human is the org owner, so the first clause passes everything.
 */
export function listAgentTeamsWire(): AgentTeamWire[] {
  const role = state.capabilities.role ?? "owner";
  return listAgentTeamRows()
    .map(agentTeamWire)
    .filter(
      (wire) =>
        role === "owner" ||
        role === "admin" ||
        wire.joined ||
        wire.agentSlugs.length > 0,
    );
}

/**
 * A flat `{error, code}` refusal — the only error shape C13 writes. That `code`
 * is what the client's expected-error taxonomy reads, so a nested body would
 * silently turn every business state into a red report-a-bug toast.
 */
export function refuse(status: number, code: string, error: string): Response {
  return json({ error, code }, status);
}

/**
 * The answer to a successful mutation, and the ONE place the fan-out happens:
 * every C13 mutation emits the SAME `AgentsChanged` the client already reacts
 * to (no new wire event type). Emitting once per successful mutation REQUEST
 * keeps that true for the no-ops too — a join on the default team, a move to
 * the team the agent is already in — so a client that wrote optimistically is
 * always reconciled. `body` omitted answers `204`; create/patch pass the team.
 */
export function mutated(body?: unknown, status = 200): Response {
  emitDomain("AgentsChanged");
  return body === undefined ? noContent() : json(body, status);
}

/** `1..60` RUNES after trimming, per the create/patch name rule. */
export function validName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  const runes = [...name].length;
  return runes >= 1 && runes <= 60 ? name : null;
}

/**
 * `^[a-z0-9-]{1,32}$`, or `""` (the CLEAR). Never trimmed.
 *
 * A glyph NAME, never an image. The VOCABULARY is the client's — which glyphs
 * exist moves on the app's release cadence — so only the SHAPE is policed here.
 * Trimming is deliberately absent, unlike `name`: this is a token a client
 * generates, not text a human types, so whitespace in one is a client bug worth
 * a 400, and trimming would quietly turn `"   "` into a clear.
 */
export function validTeamIcon(value: unknown): value is string {
  return typeof value === "string" && /^(?:[a-z0-9-]{1,32})?$/.test(value);
}

/**
 * `#rrggbb` or a theme token name, or `""` (the CLEAR). Never trimmed.
 *
 * Two spellings, one field: a literal `^#[0-9a-fA-F]{6}$` or a token name
 * `^[a-z][a-z0-9-]{0,23}$` the theme resolves. Which tokens a theme defines
 * changes with the app, so — as with the icon — the gateway checks shape only.
 */
export function validTeamColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:#[0-9a-fA-F]{6}|[a-z][a-z0-9-]{0,23})?$/.test(value)
  );
}

/**
 * The team's shared CONTEXT as a PATCH body carries it: any string, `""`
 * included, and never trimmed — the user's own blank lines and indentation are
 * the content. `undefined` means the caller omitted the key, which leaves the
 * stored context alone; a Response is the `400 invalid_context` refusal for a
 * non-string (a `null` included, exactly as `{"name": null}` refuses).
 *
 * Deliberately NOT part of {@link readTeamIdentity}: context is prose the user
 * types, not a token the client generates, so it shares none of the identity
 * rules — no shape to police, no `""`-as-CLEAR, no trim.
 */
export function readTeamContext(
  body: Record<string, unknown> | undefined,
): string | Response | undefined {
  if (!body || !("context" in body)) return undefined;
  const value = body.context;
  if (typeof value !== "string")
    return refuse(400, "invalid_context", "context must be a string");
  return value;
}

/** One identity field the caller sent, `""` included (it is the CLEAR). */
export type TeamIdentityEntry = ["icon" | "color", string];

/**
 * The identity fields PRESENT in a body (`"icon" in body`, so a field the
 * caller omitted is left alone), validated in the contract's gate order — icon
 * then colour — and returned rather than applied, so a bad `color` can never
 * leave a half-written `icon` behind. A refusal short-circuits the whole body.
 *
 * `null` is NOT a clear: it fails the `typeof === "string"` test and refuses,
 * exactly as `{"name": null}` does. There is ONE way to erase a field and it is
 * `""`, which survives here for the caller to interpret — create drops it (no
 * identity), patch deletes the stored field.
 */
export function readTeamIdentity(
  body: Record<string, unknown> | undefined,
): TeamIdentityEntry[] | Response {
  const entries: TeamIdentityEntry[] = [];
  for (const [field, valid, shape] of [
    ["icon", validTeamIcon, "a glyph name matching ^[a-z0-9-]{1,32}$"],
    ["color", validTeamColor, "#rrggbb or a theme token name"],
  ] as const) {
    if (!body || !(field in body)) continue;
    const value = body[field];
    if (!valid(value))
      return refuse(
        400,
        `invalid_${field}`,
        `${field} must be ${shape}, or "" to clear it`,
      );
    entries.push([field, value]);
  }
  return entries;
}

/**
 * Percent-decoding that cannot throw. A malformed id (`%zz`) is no server
 * error: the contract answers `404 team_not_found` for one, so the raw segment
 * is handed on and misses every lookup, which is that answer.
 */
export function decodeSeg(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}
