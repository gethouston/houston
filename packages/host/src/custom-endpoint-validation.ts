export type CloudEgressRejectionCode =
  | "endpoint_not_https"
  | "endpoint_custom_port"
  | "endpoint_private_host";

export type EndpointCheck =
  | { ok: true }
  | { ok: false; code: CloudEgressRejectionCode; reason: string };

const CLOUD_ONLY =
  "Cloud agents can only reach public HTTPS endpoints on port 443.";

export function checkPublicHttpsEndpoint(url: URL): EndpointCheck {
  if (isBlockedHostname(url.hostname)) {
    return {
      ok: false,
      code: "endpoint_private_host",
      reason: `${CLOUD_ONLY} "${url.hostname}" is a private, loopback, or link-local address the cloud can't reach; host your server on a public domain instead.`,
    };
  }
  if (url.protocol !== "https:") {
    return {
      ok: false,
      code: "endpoint_not_https",
      reason: `${CLOUD_ONLY} Use an https:// address (a tunnel or a directly hosted server).`,
    };
  }
  if (url.port !== "") {
    return {
      ok: false,
      code: "endpoint_custom_port",
      reason: `${CLOUD_ONLY} Remove the custom port ":${url.port}" from the address.`,
    };
  }
  return { ok: true };
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    return isBlockedIpv6(host.slice(1, -1));
  }
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local")) return true;
  if (isIpv4(host)) return isBlockedIpv4(host);
  if (host.includes(":")) return isBlockedIpv6(host);
  return false;
}

function isIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  return m.slice(1).every((octet) => Number(octet) <= 255);
}

function isBlockedIpv4(host: string): boolean {
  const [a, b, c, d] = host.split(".").map(Number);
  if (
    a === undefined ||
    b === undefined ||
    c === undefined ||
    d === undefined
  ) {
    return false;
  }
  if (a === 0) return true;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 169 && b === 254) return true;
  if (a >= 224 && a <= 239) return true;
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;
  return false;
}

function isBlockedIpv6(addr: string): boolean {
  const bare = addr.split("%")[0] ?? addr;
  const h = expandIpv6(bare);
  if (h === null) return true;
  const high96Zero =
    h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0;
  if (high96Zero) {
    if (h[5] === 0xffff) {
      const [g6, g7] = [h[6] ?? 0, h[7] ?? 0];
      return isBlockedIpv4(`${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`);
    }
    return true;
  }
  if (h[0] !== undefined && h[0] >= 0xfc00 && h[0] <= 0xfdff) return true;
  if (h[0] !== undefined && h[0] >= 0xfe80 && h[0] <= 0xfebf) return true;
  return false;
}

function expandIpv6(addr: string): number[] | null {
  let s = addr;
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
  if (halves.length > 2) return null;
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
