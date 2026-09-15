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
export type FileOpCode = "name_taken" | "read_only";

/** The destination name is already in use — refusing beats overwriting. */
export const NAME_TAKEN: FileOpCode = "name_taken";

/**
 * The workspace's storage refuses every write: it answered EACCES/EPERM/EROFS
 * (a read-only mount, a folder whose permissions were revoked, a sync client
 * holding it). The person's storage, not their data — and reads keep working.
 */
export const READ_ONLY: FileOpCode = "read_only";
