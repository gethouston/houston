import { posix } from "node:path";
import { type Artifact, type CodeVmMachine, VM_LIMITS, WORKDIR } from "./types";

/** base64 inflates bytes by ~4/3; the budget is on the RETURNED size. */
const encodedSize = (bytes: number) => Math.ceil(bytes / 3) * 4;

/**
 * The workdir-relative path a listing entry names, or null when the entry
 * could point anywhere else. The listing comes from inside the guest, which
 * the program controlled, so it is parsed as untrusted input.
 */
function relativeOf(entry: string): string | null {
  if (!entry.startsWith("./")) return null;
  const rel = entry.slice(2);
  if (!rel || posix.normalize(rel) !== rel || rel.startsWith("../"))
    return null;
  return rel;
}

/**
 * The files the program produced or changed, read back out of the guest.
 * Unchanged inputs are compared by CONTENT (an in-place edit that keeps the
 * length is still an edit). Anything over the budget, or that the listing
 * names outside the workdir, is reported as dropped, never silently lost.
 */
export async function collectVmArtifacts(input: {
  machine: CodeVmMachine;
  listing: string;
  /** The listing hit its cap: its last entry may be cut mid-path. */
  listingCut: boolean;
  skip: string;
  inputs: Map<string, Buffer>;
  turn: AbortSignal;
}): Promise<{ artifacts: Artifact[]; dropped: string[] }> {
  const fields = input.listing.split("\0");
  // The last field is "" after a complete listing, or a cut-off fragment of a
  // path after a truncated one; either way it names nothing.
  fields.pop();
  const artifacts: Artifact[] = [];
  const dropped: string[] = [];
  let total = 0;
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const size = Number(fields[i]);
    const entry = fields[i + 1] ?? "";
    const rel = relativeOf(entry);
    if (rel === null || !Number.isSafeInteger(size) || size < 0) {
      dropped.push(entry);
      continue;
    }
    const guest = `${WORKDIR}/${rel}`;
    if (guest === input.skip) continue;
    const seeded = input.inputs.get(guest);
    if (seeded && seeded.byteLength === size) {
      const now = await input.machine.readFile(guest, size, input.turn);
      if (now?.equals(seeded)) continue;
    }
    if (total + encodedSize(size) > VM_LIMITS.maxArtifactBytes) {
      dropped.push(rel);
      continue;
    }
    // Bounded by the listed size: a background process may still be growing
    // the file, and the budget was checked against the listing.
    const data = await input.machine.readFile(guest, size, input.turn);
    if (!data) {
      dropped.push(rel);
      continue;
    }
    total += encodedSize(data.byteLength);
    artifacts.push({
      path: rel,
      contentBase64: data.toString("base64"),
      bytes: data.byteLength,
    });
  }
  if (input.listingCut)
    dropped.push(
      "(more files than could be listed; only the first were returned)",
    );
  return { artifacts, dropped };
}
