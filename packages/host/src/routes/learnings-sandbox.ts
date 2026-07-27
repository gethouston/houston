import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  loadActivities,
  loadLearnings,
  saveLearnings,
  type TextStore,
} from "@houston/domain";
import type { HoustonEvent, Learning } from "@houston/protocol";
import { ACTING_AS_HEADER, actingAuthorFromHeader } from "../auth/acting";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { CredentialVault, WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { withDocLock } from "./doc-lock";
import { bearer, header, json, readJson } from "./http";

/** The header the runtime's `save_learning` tool carries the turn's conversation
 *  id on, so the mission a learning came from can be resolved. Provenance only —
 *  never authorization (the sandbox token is what authenticates the call). */
export const CONVERSATION_ID_HEADER = "x-houston-conversation-id";

/** The routine creator's Supabase `sub`, forwarded by the runtime when the turn
 *  is a FIRED ROUTINE (no live human, so no acting-as token). Same header the
 *  integrations sandbox route reads for the routine auth mode. */
const ACTING_USER_HEADER = "x-houston-acting-user";

/**
 * The RUNTIME-facing memory write route (`POST /sandbox/learnings/save`, authed
 * by the per-sandbox HMAC token). The agent's `save_learning` tool calls THIS
 * instead of editing `.houston/learnings/learnings.json` with file tools.
 *
 * WHY it exists (two reasons, mirroring routines-sandbox.ts):
 *  1. MERGE SAFETY. A wholesale file write drops every entry the model did not
 *     happen to read back. This route read-modify-writes (loadLearnings →
 *     append → saveLearnings), so a save never clobbers existing memory.
 *  2. PROVENANCE. Every learning should say who taught it and which mission it
 *     came from — facts the agent cannot know and must not be trusted to write.
 *     They are derived HERE: the person from the gateway-minted acting-as
 *     header, the mission from the turn's conversation id.
 *
 * Stamping semantics:
 *  - `taught_by` ONLY when `deps.gatewayFronted`. Off the gateway (desktop /
 *    self-host) an inbound acting header is untrusted client input, and there is
 *    only one human anyway — so no identity key is written at all and a
 *    single-player learnings.json keeps exactly the shape it has today. ON the
 *    gateway with no acting-as token (a FIRED ROUTINE has no driving human) the
 *    routine creator's sub — forwarded as `x-houston-acting-user` — is the
 *    author, so a routine-taught learning is never anonymous in Teams.
 *  - `mission_id` + `mission_title` whenever the conversation matches a mission,
 *    on EVERY deployment: a mission is not an identity, and "from the Q3
 *    pipeline mission" is the more useful half of provenance for a solo user.
 *    No conversation id, or no matching mission (a routine run, a chat with no
 *    board row) → no mission keys.
 *  - Everything is best-effort metadata: a failure to resolve the mission must
 *    never cost the user their learning, so the mission lookup is swallowed and
 *    the learning is saved without it.
 */
export async function handleSandboxLearnings(
  deps: {
    vault: CredentialVault;
    store: WorkspaceStore;
    vfs?: Vfs;
    paths?: WorkspacePaths;
    events?: EventHub;
    /**
     * True only when a trusted gateway fronts every request (the managed pod).
     * Then the acting-as header names the human who taught the learning; on the
     * desktop the header is untrusted client input and nothing is stamped.
     * Mirrors routes/routines-sandbox.ts.
     */
    gatewayFronted?: boolean;
  },
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== "/sandbox/learnings/save" || method !== "POST") return false;

  // Authenticate the sandbox (NOT a user JWT) — same gate as /sandbox/credential.
  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  const vfs = deps.vfs;
  if (!vfs) {
    // Same stable code the generic sandbox proxies use, so the runtime tool
    // renders the honest "not available in this install" speech act.
    json(res, 503, {
      error: "agent data not configured",
      code: "agent_data_not_configured",
    });
    return true;
  }
  const ws = await deps.store.getWorkspace(claim.workspaceId);
  const agent = await deps.store.getAgent(claim.agentId);
  if (!ws || !agent) {
    json(res, 404, { error: "agent not found" });
    return true;
  }

  const body = await readJson(req);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    json(res, 400, { error: "missing 'text'" });
    return true;
  }

  const paths = deps.paths ?? DEFAULT_PATHS;
  const root = paths.agentRoot(ws, agent);
  // WHO taught this, same two-rung ladder the integrations sandbox route walks:
  // the gateway-minted acting-as human, else the routine creator's sub (a FIRED
  // ROUTINE has no live human, so the runtime forwards `x-houston-acting-user`
  // instead). Off the gateway: nobody at all. NOT the workspace owner — on a
  // managed pod that is the placeholder "local-owner", which resolves to no
  // profile and would only put a junk id in the file.
  const actingUser = header(req, ACTING_USER_HEADER);
  const taughtBy = deps.gatewayFronted
    ? (actingAuthorFromHeader(req.headers[ACTING_AS_HEADER]) ??
      (actingUser ? { user_id: actingUser } : null))
    : null;
  const mission = await resolveMission(
    vfs,
    root,
    header(req, CONVERSATION_ID_HEADER),
  );

  const learning: Learning = {
    id: randomUUID(),
    text,
    created_at: new Date().toISOString(),
    // Spread-when-present: absent provenance writes NO key, so a single-player
    // learnings.json stays byte-identical in shape to today's.
    ...(taughtBy ? { taught_by: taughtBy } : {}),
    ...mission,
  };

  // Merge-save: read what is there, append, write the whole set back — so a
  // second save never clobbers the first. Under the per-doc lock (see
  // doc-lock.ts) because the read-modify-write is only merge-safe when it is
  // ATOMIC: two saves from different conversations on the same pod, or a save
  // racing the Memory tab's whole-file PUT (agent-data.ts, same key), would
  // otherwise both load the same base list and the last write would win.
  await withDocLock(`${root}#learnings`, async () => {
    const { items } = await loadLearnings(vfs, root);
    await saveLearnings(vfs, root, [...items, learning]);
  });
  // React on the SAME channel a UI or file-watcher write does; scope to the
  // workspace owner, exactly as the agent-data learnings PUT does.
  const event: HoustonEvent = { type: "LearningsChanged", agentPath: agent.id };
  deps.events?.emit(ws.ownerUserId, event);

  json(res, 201, learning);
  return true;
}

/**
 * The mission a conversation belongs to, as the learning's mission keys, or an
 * empty object when there is no id / no match / the read failed.
 *
 * Matching uses the SAME convention as per-mission attribution
 * (`activity-attribution.ts`): a mission's `session_key` IS the turn's
 * conversation id, with `activity-<id>` as the fallback for missions whose key
 * was never persisted separately.
 *
 * `mission_title` is denormalized on purpose: the mission may later be renamed
 * or deleted, and a learning that reads "from a mission that no longer exists"
 * is worse than one that keeps the title it was taught under. Renderers prefer
 * the live title looked up by `mission_id` and fall back to this.
 */
async function resolveMission(
  store: TextStore,
  root: string,
  conversationId: string | undefined,
): Promise<{ mission_id?: string; mission_title?: string }> {
  if (!conversationId) return {};
  try {
    const { items } = await loadActivities(store, root);
    const activity = items.find(
      (a) =>
        a.session_key === conversationId ||
        `activity-${a.id}` === conversationId,
    );
    if (!activity) return {};
    return {
      mission_id: activity.id,
      ...(activity.title ? { mission_title: activity.title } : {}),
    };
  } catch (err) {
    // Provenance is metadata: never cost the user their learning over it.
    console.error(`[learnings] mission lookup failed for ${root}:`, err);
    return {};
  }
}
