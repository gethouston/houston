import { isIP } from "node:net";
import type { FenceLookup } from "./fence-resolve";
import type { OwnAddresses, PrivateNetworks } from "./ip-ranges";
import { blockedAddress, isIpv6LinkLocal, parseIp } from "./ip-ranges";
import { blockedHost } from "./url-policy";

export type { FenceLookup, ResolvedAddress } from "./fence-resolve";

export const MAX_CONNECT_ADDRESSES = 4;

export type FenceVerdict =
  | { kind: "allowed"; addresses: readonly string[] }
  | { kind: "refused" }
  | { kind: "unreachable" };

export function bareHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

export async function judgeTarget(
  rawHost: string,
  privateNetworks: PrivateNetworks,
  lookup: FenceLookup,
  own?: OwnAddresses,
): Promise<FenceVerdict> {
  const host = bareHost(rawHost);
  const refused = (address: string) =>
    parseIp(address) === null ||
    blockedAddress(address, privateNetworks, own) !== null;
  if (!host || blockedHost(host, privateNetworks)) return { kind: "refused" };
  if (isIP(host))
    return refused(host)
      ? { kind: "refused" }
      : { kind: "allowed", addresses: [host] };
  let answers: readonly { address: string }[];
  try {
    answers = await lookup(host);
  } catch (error) {
    if (isDnsMiss(error)) return { kind: "unreachable" };
    throw error;
  }
  if (answers.length === 0) return { kind: "unreachable" };
  const usable = answers.filter((a) => !isIpv6LinkLocal(a.address));
  const judged = usable.length > 0 ? usable : answers;
  if (judged.some((a) => refused(a.address))) return { kind: "refused" };
  const addresses = [...new Set(judged.map((a) => a.address))];
  return {
    kind: "allowed",
    addresses: addresses.slice(0, MAX_CONNECT_ADDRESSES),
  };
}

function isDnsMiss(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    /^(ENOTFOUND|ENODATA|EAI_AGAIN|ESERVFAIL|ETIMEOUT|ENONAME|EAI_FAIL|EREFUSED|EBADNAME|EBADRESP|ECONNREFUSED)$/.test(
      error.code,
    )
  );
}

export function parseAuthority(
  authority: string,
): { host: string; port: number } | null {
  const match = /^(\[[^\]]+\]|[^:[\]]+):(\d{1,5})$/.exec(authority);
  const port = Number(match?.[2]);
  if (!match?.[1] || !Number.isInteger(port) || port < 1 || port > 65_535)
    return null;
  return { host: match[1], port };
}
