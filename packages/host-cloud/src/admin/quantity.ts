/**
 * Parsers for Kubernetes resource quantity strings, used to total a pod's CPU and
 * memory *requests* (what GKE Autopilot bills on) for the live cost estimate.
 *
 * Kubernetes quantities are documented at
 * https://kubernetes.io/docs/reference/kubernetes-api/common-definitions/quantity/.
 * We deliberately handle only the forms that appear in resource requests: a plain
 * decimal, the `m` (milli) suffix for CPU, and the binary (Ki/Mi/Gi/…) and decimal
 * SI (k/M/G/…) suffixes for memory. An unrecognised string throws rather than
 * silently scoring as zero — a miscount would understate the bill.
 */

/** CPU quantity → cores. "250m" → 0.25, "1" → 1, "1.5" → 1.5, "" → 0. */
export function parseCpuToCores(q: string | undefined | null): number {
  if (!q) return 0;
  const trimmed = q.trim();
  if (trimmed.endsWith("m")) {
    const millis = Number(trimmed.slice(0, -1));
    if (!Number.isFinite(millis))
      throw new Error(`unparseable cpu quantity: ${q}`);
    return millis / 1000;
  }
  const cores = Number(trimmed);
  if (!Number.isFinite(cores))
    throw new Error(`unparseable cpu quantity: ${q}`);
  return cores;
}

/** Binary (power-of-1024) and decimal (power-of-1000) memory suffix multipliers. */
const MEM_MULTIPLIER: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
};

/** Memory quantity → bytes. "512Mi" → 536870912, "2Gi" → 2147483648, "1000" → 1000. */
export function parseMemToBytes(q: string | undefined | null): number {
  if (!q) return 0;
  const trimmed = q.trim();
  const match = trimmed.match(/^([0-9]*\.?[0-9]+)([A-Za-z]+)?$/);
  if (!match) throw new Error(`unparseable memory quantity: ${q}`);
  const value = Number(match[1]);
  const suffix = match[2];
  if (!Number.isFinite(value))
    throw new Error(`unparseable memory quantity: ${q}`);
  if (!suffix) return value;
  const mult = MEM_MULTIPLIER[suffix];
  if (mult === undefined)
    throw new Error(`unknown memory suffix in quantity: ${q}`);
  return value * mult;
}

const BYTES_PER_GIB = 1024 ** 3;
const BYTES_PER_MIB = 1024 ** 2;

export function bytesToGiB(bytes: number): number {
  return bytes / BYTES_PER_GIB;
}

export function bytesToMiB(bytes: number): number {
  return bytes / BYTES_PER_MIB;
}
