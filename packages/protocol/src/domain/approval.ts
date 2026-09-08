/**
 * APPROVAL RECEIPTS — how a person's yes/no to a destructive Houston operation
 * travels from the card they clicked to the process that holds the credential.
 *
 * The rule this exists to keep: THE MODEL CANNOT MINT AN APPROVAL. The host
 * issues a `requestId` when it raises an approval card, and the only thing that
 * turns that id into a receipt is a USER message carrying it — which the model
 * has no way to author (assistant messages never travel the host's user-message
 * route, and a routine's unattended turn is fired straight at the runtime,
 * bypassing it entirely).
 *
 * It rides as its OWN field on the send-message request (`approvals`), never
 * inside the message text: the text is the person's words and belongs to them,
 * a marker hidden in it is invisible to every reader that is not looking for it,
 * and anything that must be stripped back out again can be stripped wrongly.
 * The host reads the field off the request, records the receipts, and drops the
 * field before forwarding — so the runtime, the model and the transcript see
 * only what the person actually wrote.
 *
 * Type-only imports would be erased, so this module deliberately has NO imports
 * at all: the app's node:test runner loads it directly by subpath.
 */

/** What the person answered on one approval card. */
export type ApprovalDecision = "approve" | "deny";

/** One card's outcome: the host-issued request it answers, and the answer. */
export interface MessageApproval {
  requestId: string;
  decision: ApprovalDecision;
}

/**
 * The receipts a send-message request carries, validated entry by entry.
 *
 * Tolerant by construction, and fail-closed: anything that is not a well-formed
 * receipt is DROPPED rather than trusted, so an unreadable field approves
 * nothing and the user is asked again. Absence and an empty list are the same
 * answer — no receipts.
 */
export function parseMessageApprovals(value: unknown): MessageApproval[] {
  if (!Array.isArray(value)) return [];
  const approvals: MessageApproval[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { requestId, decision } = entry as {
      requestId?: unknown;
      decision?: unknown;
    };
    if (typeof requestId !== "string" || requestId === "") continue;
    if (decision !== "approve" && decision !== "deny") continue;
    approvals.push({ requestId, decision });
  }
  return approvals;
}

/**
 * ONE argument the operation would run with, as the card must show it.
 *
 * Structural on purpose: the HOST decides WHAT is being approved (the operation
 * and the exact bytes), the SURFACE decides what language to say it in. A
 * sentence authored in the host can only ever be authored in one language, and
 * a person cannot approve what they cannot read.
 *
 * `value` is the argument verbatim, already text (objects as their JSON). It is
 * never abbreviated silently: past the host's limit it is cut and `truncated`
 * carries how many characters were left out, so the surface can say so in
 * words. `long` is the host's judgement that the value cannot sit inside a
 * sentence (it is long or multi-line) and belongs in the card's own block.
 */
export interface ApprovalArg {
  /** The parameter's name as the catalog declares it (`agentSlugOrId`). */
  name: string;
  value: string;
  long: boolean;
  /** Characters cut off the end of `value`. Absent when nothing was cut. */
  truncated?: number;
}

/** The host-owned content a shell displays before sending a receipt.
 *
 *  `title`/`detail` are the host's plain-English rendering, for text-only
 *  surfaces and as the fallback for any shell that cannot localize the
 *  operation. A shell that can renders `operation` + `args` in its own
 *  language. `label` on each option is likewise a default the surface is
 *  expected to override with its own locale. */
export interface ApprovalPresentation {
  title: string;
  detail?: string;
  args: ApprovalArg[];
  options: {
    kind: "approval";
    id: "approve" | "decline";
    label: string;
  }[];
  operation: string;
  expiresAt: number;
}
