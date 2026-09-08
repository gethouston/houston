/**
 * What the parity suite drives, and the vocabulary the probe tables share.
 *
 * The generated catalog describes ONE surface that the local host and the
 * hosted gateway both serve. The tables are how that claim stays true: every
 * routable operation the assistant can call is named in exactly one of them,
 * and the suite asserts that coverage is complete — a new annotated operation
 * that nobody probed fails the build rather than shipping unexercised.
 *
 * Three tables, because there are three honest answers to "what happens when
 * the local host is asked to perform this?":
 *
 * - `LOCAL_PROBES` (./assistant-parity-local-probes) — it answers.
 * - `CLOUD_ONLY_PROBES` (./assistant-parity-cloud-probes) — it legitimately
 *   does not, and the probe asserts the miss so a path that starts resolving
 *   locally shows up as the drift it is.
 * - `WRITE_DRIVEN_OPERATIONS` — driven end to end by the write suite, which
 *   proves the method, the body mapping and the id round-trip rather than just
 *   the address.
 */

/** The agent and workspace the probe's temporary host is seeded with. */
export const PROBE_AGENT = "Work/Sales";
export const PROBE_WORKSPACE = "Work";

/**
 * The folder the file probes create, rename, move and delete in sequence. The
 * Files routes act on real paths, so they are exercised against something the
 * probes own rather than against the agent's seeded content.
 */
export const PROBE_FOLDER = "parity probe";
export const PROBE_FOLDER_RENAMED = "parity probe renamed";

export interface Probe {
  operation: string;
  params: Record<string, unknown>;
  /**
   * Set when the honest answer on a bare probe host is a 5xx: the handler is
   * real and answers for itself, but the capability behind it is not wired in
   * a host seeded with nothing. The string says which state, and the suite
   * asserts that status instead of the usual "below 500".
   */
  serviceState?: { status: number; reason: string };
}

/** A probe the local host is expected to MISS, with the reason it may. */
export interface CloudOnlyProbe extends Probe {
  reason: string;
}

export const probe = (
  operation: string,
  params: Record<string, unknown> = {},
  serviceState?: Probe["serviceState"],
): Probe => ({ operation, params, ...(serviceState ? { serviceState } : {}) });

export const cloudOnly = (
  operation: string,
  reason: string,
  params: Record<string, unknown> = {},
): CloudOnlyProbe => ({ operation, params, reason });

/**
 * Operations the write suite drives against the real host by their effect, so
 * they carry no address probe of their own. Listed here because the coverage
 * assertion counts them: an operation is covered by a probe table OR by a
 * write, never by neither.
 */
export const WRITE_DRIVEN_OPERATIONS: readonly string[] = [
  "createActivity",
  "deleteActivity",
  "createAgent",
  "renameAgent",
  "deleteAgent",
];
