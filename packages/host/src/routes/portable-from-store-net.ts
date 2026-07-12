import { lookup as dnsLookup } from "node:dns/promises";

/**
 * DNS-level SSRF vetting for "install from a link". The string-only host check
 * (portable-from-store-url.ts) cannot see where a public multi-label name actually
 * resolves, so a hostname like `agent.evil.com` pointing at `169.254.169.254`
 * (cloud metadata) or an RFC1918 address would slip past it. Here we resolve the
 * host and reject if ANY answer lands in a loopback / private / link-local / ULA
 * range, closing that gap before a single byte is fetched.
 */

/** Resolve a hostname to all its A/AAAA addresses. Injectable for tests. */
export type HostLookup = (hostname: string) => Promise<string[]>;

export const defaultHostLookup: HostLookup = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
};

/** Parse a dotted-quad IPv4 string to a 32-bit unsigned int, or null. */
function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const [a, b, c, d] = m.slice(1, 5).map(Number);
  if (
    a === undefined ||
    b === undefined ||
    c === undefined ||
    d === undefined
  ) {
    return null;
  }
  if (a > 255 || b > 255 || c > 255 || d > 255) return null;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

/** IPv4 ranges that must never be fetched (loopback, private, link-local, …). */
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved / broadcast
];

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return BLOCKED_V4.some(([base, bits]) => {
    const b = ipv4ToInt(base);
    if (b === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  });
}

function isBlockedIpv6(ip: string): boolean {
  const h = ip.toLowerCase().split("%")[0] ?? ""; // drop any zone id
  // IPv4-mapped (::ffff:a.b.c.d) or -compatible (::a.b.c.d): vet the embedded v4.
  const mapped = h.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1] ?? "");
  if (h === "::" || h === "::1") return true; // unspecified / loopback
  if (/^f[cd][0-9a-f]{2}(?::|$)/.test(h)) return true; // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f](?::|$)/.test(h)) return true; // fe80::/10 link-local
  if (/^ff[0-9a-f]{2}(?::|$)/.test(h)) return true; // ff00::/8 multicast
  return false;
}

/** True when a resolved IP literal must never be fetched. */
export function isBlockedAddress(ip: string): boolean {
  return ip.includes(":") ? isBlockedIpv6(ip) : isBlockedIpv4(ip);
}

/** Outcome of vetting a hostname's resolved addresses. */
export type HostVetResult = { ok: true } | { status: number; error: string };

/**
 * Resolve `hostname` and reject if any answer is a blocked address. A resolution
 * failure surfaces as 502 (never swallowed); a private/internal answer as 400.
 */
export async function vetResolvedHost(
  hostname: string,
  lookup: HostLookup,
): Promise<HostVetResult> {
  let addresses: string[];
  try {
    addresses = await lookup(hostname);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 502,
      error: `Could not reach the agent store: ${message}`,
    };
  }
  if (addresses.length === 0) {
    return { status: 502, error: "Could not reach the agent store." };
  }
  if (addresses.some(isBlockedAddress)) {
    return {
      status: 400,
      error: "That link points to an address we cannot open.",
    };
  }
  return { ok: true };
}
