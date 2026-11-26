/**
 * Why a workspace files write refused — the machine-readable code the host
 * answers beside the HTTP status in the error body, and the one the client
 * picks the authored sentence from.
 *
 * It lives in the protocol because BOTH ends have to agree on it: the host
 * raises it (`packages/host/src/turn/files-path.ts`), the client classifies on
 * it (`app/src/lib/file-conflicts.ts`), and the fake host answers with it. A
 * status cannot identify a state — the moment the route grows a SECOND 409 or
 * a second 403, a client that keyed on the status explains the new state with
 * the old one's copy and silences the report along with it. Two hand-kept
 * copies of the union would reach that same failure one release later, which
 * is the whole reason there is only one here.
 */
export type FileOpCode = "name_taken" | "read_only" | "outside_workspace";

/**
 * Why an agent create, install or rename refused its name: another agent holds
 * it ({@link NAME_TAKEN}, 409), or it is the one no AI Employee may newly take
 * ({@link NAME_RESERVED}, 400).
 */
export type AgentNameRefusalCode = "name_taken" | "name_reserved";

/**
 * The destination name is already in use — refusing beats overwriting. The
 * agent routes answer it too: an agent create, install or rename onto another
 * agent's name (`packages/host/src/routes/agent-name-taken.ts`), classified by
 * `isAgentNameTaken` in `@houston/sdk`. So it is a code of both vocabularies.
 */
export const NAME_TAKEN: FileOpCode & AgentNameRefusalCode = "name_taken";

/**
 * The name is the AI Manager's own ("Houston", compared as `agentNameKey` in
 * `@houston/domain`), so no AI Employee may newly take it. An employee that
 * already holds it keeps it. Raised by the host at its user-facing edge
 * (`packages/host/src/routes/agent-name-reserved.ts`) and by the hosted
 * gateway, classified by `isAgentNameReserved` in `@houston/sdk`.
 */
export const NAME_RESERVED: AgentNameRefusalCode = "name_reserved";

/**
 * The workspace's storage refuses every write: it answered EACCES/EPERM/EROFS
 * (a read-only mount, a folder whose permissions were revoked, a sync client
 * holding it). The person's storage, not their data — and reads keep working.
 */
export const READ_ONLY = "read_only" satisfies FileOpCode;

/**
 * The path names no file of the agent's own: it climbs out with `..`, sits in
 * an internal dot-directory (`.houston/`, `.agents/`), or is an absolute path
 * outside the agent's workspace root (a turn sandbox's `/work/...` above all,
 * HOUSTON-APP-5HK). Answered as a 400 by every files route that validates a
 * path (`packages/host/src/turn/files-path.ts`); classified by the SDK's
 * `isOutsideWorkspaceRefusal`. On a read it is an agent's link to a place the
 * person's Files tab does not show, so it gets copy of its own.
 */
export const OUTSIDE_WORKSPACE = "outside_workspace" satisfies FileOpCode;
