import { createHash } from "node:crypto";

/**
 * The fingerprint an approval is bound to.
 *
 * Kept apart from the store because it is the ONE thing both ends of the
 * receipt agree on: the host hashes the arguments it raised a card for, then
 * hashes the arguments actually submitted with the call, and refuses unless
 * they are the same. Approving "delete Personal/Dobby" therefore approves
 * nothing else.
 */

/**
 * A stable fingerprint of ONE exact call. Object keys are sorted and
 * `undefined` values dropped so two spellings of the same arguments agree,
 * while array order is preserved because it is meaningful. Anything that
 * changes what the operation would DO changes the hash, which is what makes an
 * approval un-reusable for a different target.
 */
export function approvalKey(
  operation: string,
  params: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(`${operation}\n${canonicalize(params)}`)
    .digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(",")}}`;
}
