import { NAME_RESERVED, NAME_TAKEN } from "@houston/protocol/file-refusal";
import { refusalCode, refusalStatus } from "../refusal-code";

/**
 * Whether a failed agent create, install or rename was refused because
 * another agent already holds the name, compared as the folder it becomes
 * (`sameAgentName`: trimmed, NFC, case-insensitive). An expected state with
 * its own authored copy, never a bug to report.
 *
 * The host and the hosted gateway both answer 409 with the protocol's
 * `name_taken` code (packages/host/src/routes/agent-name-taken.ts). A 409
 * carrying no code reads as name-taken too, so a server that omits the code
 * still gets the authored copy; a 409 naming any OTHER code is a different
 * state and stays a failure.
 */
export function isAgentNameTaken(error: unknown): boolean {
  if (!(error instanceof Error) || refusalStatus(error) !== 409) return false;
  const code = refusalCode(error);
  return code === null || code === NAME_TAKEN;
}

/**
 * Whether a failed agent create, install or rename was refused because the
 * name is the AI Manager's own ("Houston") and the agent did not already hold
 * it. Surfaces pre-check the same rule (`takesReservedAgentName`), so this
 * answers the refusal a stale local name leads to: a rename whose loaded list
 * still shows the agent's previous name. Keyed on the protocol's
 * `name_reserved` code alone, whatever status carries it.
 */
export function isAgentNameReserved(error: unknown): boolean {
  return error instanceof Error && refusalCode(error) === NAME_RESERVED;
}
