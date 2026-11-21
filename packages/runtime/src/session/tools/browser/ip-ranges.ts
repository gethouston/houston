import { isIP } from "node:net";
import { networkInterfaces } from "node:os";

export interface IpPrefix {
  bits: 32 | 128;
  base: bigint;
  length: number;
}

export type PrivateNetworks = "blocked" | "allowed";

type Env = Record<string, string | undefined>;

export function privateNetworksFor(env: Env): PrivateNetworks {
  return env.HOUSTON_MANAGED_CLOUD === "1" ? "blocked" : "allowed";
}

export const ALWAYS_BLOCKED_PREFIXES: readonly string[] = [
  "0.0.0.0/8",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "::/8",
  "fe80::/9",
  "fd00:ec2::254/128",
  "100.100.100.200/32",
];

export const PRIVATE_NETWORK_PREFIXES: readonly string[] = [
  "10.0.0.0/8",
  "100.64.0.0/10",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "fc00::/7",
];

const THIS_MACHINE = ["0.0.0.0/8", "127.0.0.0/8", "::/8"];

function v4(text: string): bigint {
  return text
    .split(".")
    .reduce((acc, part) => (acc << 8n) | BigInt(Number(part)), 0n);
}

function v6(text: string): bigint {
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];
  const hex = dotted
    ? text.slice(0, -dotted.length) +
      [v4(dotted) >> 16n, v4(dotted) & 0xffffn]
        .map((g) => g.toString(16))
        .join(":")
    : text;
  const [head = "", tail] = hex.split("::");
  const groups = (part: string) => (part ? part.split(":") : []);
  const missing = 8 - groups(head).length - groups(tail ?? "").length;
  const all = [
    ...groups(head),
    ...(tail === undefined ? [] : Array<string>(missing).fill("0")),
    ...groups(tail ?? ""),
  ];
  return all.reduce((acc, g) => (acc << 16n) | BigInt(`0x${g}`), 0n);
}

const MAPPED_V4 = 0xffffn << 32n;

export function parseIp(
  host: string,
): { bits: 32 | 128; value: bigint } | null {
  const bare = host.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const family = isIP(bare);
  if (family === 4) return { bits: 32, value: v4(bare) };
  if (family !== 6) return null;
  const value = v6(bare.toLowerCase());
  if (value >> 32n === MAPPED_V4 >> 32n)
    return { bits: 32, value: value & 0xffff_ffffn };
  return { bits: 128, value };
}

export function parsePrefix(cidr: string): IpPrefix {
  const [address = "", length = ""] = cidr.split("/");
  const bits = isIP(address) === 4 ? 32 : 128;
  return {
    bits,
    base: bits === 32 ? v4(address) : v6(address),
    length: Number(length),
  };
}

function contains(prefix: IpPrefix, bits: number, value: bigint): boolean {
  if (prefix.bits !== bits) return false;
  const shift = BigInt(bits - prefix.length);
  return value >> shift === prefix.base >> shift;
}

const ALWAYS = ALWAYS_BLOCKED_PREFIXES.map(parsePrefix);
const PRIVATE = PRIVATE_NETWORK_PREFIXES.map(parsePrefix);
const LOCAL = THIS_MACHINE.map(parsePrefix);
const V6_LINK_LOCAL = parsePrefix("fe80::/10");

export function isIpv6LinkLocal(address: string): boolean {
  const ip = parseIp(address);
  return ip !== null && contains(V6_LINK_LOCAL, ip.bits, ip.value);
}

export type OwnAddresses = ReadonlySet<string>;

const NO_OWN_ADDRESSES: OwnAddresses = new Set();

function ipKey(ip: { bits: number; value: bigint }): string {
  return `${ip.bits}:${ip.value}`;
}

export function ownAddresses(
  interfaces: Record<
    string,
    readonly { address: string }[] | undefined
  > = networkInterfaces(),
): OwnAddresses {
  const own = new Set<string>();
  for (const entries of Object.values(interfaces))
    for (const entry of entries ?? []) {
      const ip = parseIp(entry.address);
      if (ip) own.add(ipKey(ip));
    }
  return own;
}

export function blockedAddress(
  host: string,
  privateNetworks: PrivateNetworks,
  own: OwnAddresses = NO_OWN_ADDRESSES,
): "this_machine" | "link_local" | "private_network" | null {
  const ip = parseIp(host);
  if (!ip) return null;
  const within = (p: IpPrefix) => contains(p, ip.bits, ip.value);
  if (LOCAL.some(within) || own.has(ipKey(ip))) return "this_machine";
  if (ALWAYS.some(within)) return "link_local";
  if (privateNetworks === "blocked" && PRIVATE.some(within))
    return "private_network";
  return null;
}
