/**
 * IR ingestion glue shared by POST /api/agents and PATCH /api/agents/:id { ir }.
 *
 * Runs the full forgiving-then-strict pipeline in one place:
 *   normalizeAgentIr (backfill safe defaults) -> agentIrSchema.parse (422 on a
 *   genuine problem) -> scanIrForSecrets (422 if a credential looks leaked).
 * The stored snapshot is therefore always a complete, schema-valid, secret-free
 * AgentIR 2.0.0. Returns a discriminated result; the handler maps `{ status,
 * body }` straight onto its JSON error response.
 */

import {
  type AgentIR,
  agentIrSchema,
  normalizeAgentIr,
  scanIrForSecrets,
} from "@houston/agentstore-contract";

export type IngestResult =
  | { ok: true; ir: AgentIR; notes: string[] }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Accept either a bare AgentIR or a `{ ir }` envelope and return the inner IR
 * candidate. Anything else is passed through untouched for validation to reject.
 */
export function unwrapIrInput(body: Record<string, unknown>): unknown {
  const inner = body.ir;
  if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
    return inner;
  }
  return body;
}

/** Normalize, validate, and secret-scan an untrusted IR candidate. */
export function ingestIr(input: unknown): IngestResult {
  const { ir: normalized, notes } = normalizeAgentIr(input);

  // safeParse (not parse+instanceof): the schema is built with the contract's own
  // zod copy, so a ZodError thrown across the package boundary would not satisfy an
  // `instanceof ZodError` against the app's copy.
  const result = agentIrSchema.safeParse(normalized);
  if (!result.success) {
    return {
      ok: false,
      status: 422,
      body: { error: "invalid_ir", details: result.error.flatten(), notes },
    };
  }
  const ir: AgentIR = result.data;

  const findings = scanIrForSecrets(ir);
  if (findings.length > 0) {
    return {
      ok: false,
      status: 422,
      body: { error: "secrets_detected", findings },
    };
  }

  return { ok: true, ir, notes };
}
