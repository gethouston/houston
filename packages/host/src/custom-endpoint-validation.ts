/**
 * Managed-cloud egress guard for a user-supplied OpenAI-compatible base URL.
 *
 * A cloud agent pod's NetworkPolicy allows egress ONLY to public TCP 443 —
 * RFC-1918 (10/8, 172.16/12, 192.168/16), loopback (127/8, ::1), link-local
 * (169.254/16, fe80::/10), IPv6 ULA (fc00::/7), and the cloud metadata IP are
 * all dropped at the packet level. A base URL that targets any of those, a
 * non-443 port, or plain http can never connect, so we reject it at save time
 * with a reason the user can act on rather than letting every turn fail with an
 * opaque connection error. Desktop/self-host skip this entirely (localhost is
 * exactly what they target).
 */

export type EndpointCheck = { ok: true } | { ok: false; reason: string };

/** The one throughline every rejection reason opens with. */
const CLOUD_ONLY =
  "Cloud agents can only reach public HTTPS endpoints on port 443.";

/**
 * Validate a parsed base URL against the managed-cloud egress policy. The caller
 * has already confirmed it is a syntactically valid http(s) URL; this adds the
 * public-:443-HTTPS-only constraints. Call ONLY on the managed cloud profile.
 */
export function checkPublicHttpsEndpoint(url: URL): EndpointCheck {
  if (url.protocol !== "https:") {
    return {
      ok: false,
      reason: `${CLOUD_ONLY} Use an https:// address (a tunnel or a directly hosted server).`,
    };
  }
  // The WHATWG URL parser normalizes an explicit default port (:443 for https)
  // to "", so a non-empty port is always an explicit non-443 port.
  if (url.port !== "") {
    return {
      ok: false,
      reason: `${CLOUD_ONLY} Remove the custom port ":${url.port}" from the address.`,
    };
  }
  if (isBlockedHostname(url.hostname)) {
    return {
      ok: false,
      reason: `${CLOUD_ONLY} "${url.hostname}" is a private, loopback, or link-local address the cloud can't reach; host your server on a public domain instead.`,
    };
  }
  return { ok: true };
}

/** True when the hostname is a name or IP literal a cloud pod's egress blocks. */
function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  // url.hostname keeps the brackets around an IPv6 literal, e.g. "[::1]".
  if (host.startsWith("[") && host.endsWith("]")) {
    return isBlockedIpv6(host.slice(1, -1));
  }
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  // mDNS/Bonjour names (`printer.local`) resolve only on a LAN.
  if (host.endsWith(".local")) return true;
  if (isIpv4(host)) return isBlockedIpv4(host);
  // A bare IPv6 with no brackets shouldn't reach here (url.hostname brackets
  // them), but classify defensively rather than treat it as a public name.
  if (host.includes(":")) return isBlockedIpv6(host);
  return false;
}

function isIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  return m.slice(1).every((octet) => Number(octet) <= 255);
}

/**
 * Non-public IPv4: loopback 127/8, private 10/8, 172.16/12, 192.168/16,
 * link-local 169.254/16 (incl. the metadata IP), plus the "current network"
 * 0/8, CGNAT 100.64/10, benchmarking 198.18/15, multicast 224/4, and the
 * limited broadcast 255.255.255.255.
 */
function isBlockedIpv4(host: string): boolean {
  const [a, b, c, d] = host.split(".").map(Number);
  // isIpv4 guarantees four octets, but narrow for the type-checker.
  if (
    a === undefined ||
    b === undefined ||
    c === undefined ||
    d === undefined
  ) {
    return false;
  }
  if (a === 0) return true; // "this network" 0.0.0.0/8
  if (a === 127) return true; // loopback 127/8
  if (a === 10) return true; // private 10/8
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16/12
  if (a === 192 && b === 168) return true; // private 192.168/16
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18/15
  if (a === 169 && b === 254) return true; // link-local + metadata 169.254/16
  if (a >= 224 && a <= 239) return true; // multicast 224/4
  if (a === 255 && b === 255 && c === 255 && d === 255) return true; // broadcast
  return false;
}

/**
 * Non-public IPv6: loopback (::1), ULA (fc00::/7), link-local (fe80::/10), and —
 * critically for the managed-cloud gate — any IPv4-mapped (::ffff:0:0/96) or
 * IPv4-compatible/low (::/96) literal. WHATWG URL normalizes IPv4-mapped forms
 * to hex (`::ffff:169.254.169.254` → `::ffff:a9fe:a9fe`), which a socket still
 * reaches over IPv4; we range-check the embedded IPv4 for mapped forms and fail
 * CLOSED for every other ::/96 or unparseable literal.
 */
function isBlockedIpv6(addr: string): boolean {
  // Drop a zone id (`fe80::1%eth0`) before classifying.
  const bare = addr.split("%")[0] ?? addr;
  const h = expandIpv6(bare);
  if (h === null) return true; // unparseable bracketed literal → fail closed
  const high96Zero =
    h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0;
  if (high96Zero) {
    // IPv4-mapped ::ffff:0:0/96 carries a real IPv4 in the low 32 bits.
    if (h[5] === 0xffff) {
      const [g6, g7] = [h[6] ?? 0, h[7] ?? 0];
      return isBlockedIpv4(`${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`);
    }
    // Unspecified ::, loopback ::1, and deprecated IPv4-compatible ::x.x.x.x
    // are never a reachable public endpoint — fail closed.
    return true;
  }
  if (h[0] !== undefined && h[0] >= 0xfc00 && h[0] <= 0xfdff) return true; // ULA fc00::/7
  if (h[0] !== undefined && h[0] >= 0xfe80 && h[0] <= 0xfebf) return true; // link-local fe80::/10
  return false;
}

/** Expand an IPv6 literal to its 8 hextets, or null when it can't be parsed. */
function expandIpv6(addr: string): number[] | null {
  let s = addr;
  // Fold a trailing dotted-quad (e.g. `::ffff:127.0.0.1`) into two hex groups.
  const dotted = s.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted?.[1] && dotted[2]) {
    if (!isIpv4(dotted[2])) return null;
    const o = dotted[2].split(".").map(Number);
    const hi = ((((o[0] ?? 0) << 8) | (o[1] ?? 0)) >>> 0).toString(16);
    const lo = ((((o[2] ?? 0) << 8) | (o[3] ?? 0)) >>> 0).toString(16);
    s = `${dotted[1]}${hi}:${lo}`;
  }
  const parse = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(Number.parseInt(g, 16));
    }
    return out;
  };
  const halves = s.split("::");
  if (halves.length > 2) return null; // at most one "::" is legal
  const head = parse(halves[0] ?? "");
  if (head === null) return null;
  if (halves.length === 2) {
    const tail = parse(halves[1] ?? "");
    if (tail === null) return null;
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    return [...head, ...Array(missing).fill(0), ...tail];
  }
  return head.length === 8 ? head : null;
}
