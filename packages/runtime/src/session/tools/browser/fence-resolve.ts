import { lookup as osLookupAll, Resolver } from "node:dns/promises";
import { limiter, shareInFlight } from "./fence-limit";
import type { PrivateNetworks } from "./ip-ranges";

export { limiter } from "./fence-limit";

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type FenceLookup = (
  host: string,
  signal?: AbortSignal,
) => Promise<readonly ResolvedAddress[]>;

export interface FenceResolver {
  resolve4(host: string): Promise<string[]>;
  resolve6(host: string): Promise<string[]>;
}

export type OsLookupAll = (host: string) => Promise<readonly ResolvedAddress[]>;

const TRY_TIMEOUT_MS = 2_500;
const TRIES = 2;
const LOOKUP_DEADLINE_MS = 8_000;
const MAX_IN_FLIGHT = 8;
const MAX_OS_IN_FLIGHT = 2;

const lookups: Partial<Record<PrivateNetworks, FenceLookup>> = {};

const NO_RECORDS = new Set(["ENODATA", "ENOTFOUND", "ENONAME", "NOTFOUND"]);

export function lookupFor(privateNetworks: PrivateNetworks): FenceLookup {
  const made =
    lookups[privateNetworks] ??
    (privateNetworks === "blocked" ? caresLookup() : osLookup());
  lookups[privateNetworks] = made;
  return made;
}

export function caresLookup(
  resolver: FenceResolver = new Resolver({
    timeout: TRY_TIMEOUT_MS,
    tries: TRIES,
  }),
  deadlineMs = LOOKUP_DEADLINE_MS,
  maxInFlight = MAX_IN_FLIGHT,
): FenceLookup {
  const limit = limiter(maxInFlight);
  return shareInFlight((host, signal) =>
    limit(() => withDeadline(resolveBoth(resolver, host), deadlineMs), signal),
  );
}

export function osLookup(
  lookupAll: OsLookupAll = (host) => osLookupAll(host, { all: true }),
  deadlineMs = LOOKUP_DEADLINE_MS,
  maxInFlight = MAX_OS_IN_FLIGHT,
): FenceLookup {
  const limit = limiter(maxInFlight);
  const shared = shareInFlight((host, signal, hold) =>
    limit(async () => {
      hold();
      return ipv4First(await lookupAll(host));
    }, signal),
  );
  return (host, signal) => withDeadline(shared(host, signal), deadlineMs);
}

function ipv4First(answers: readonly ResolvedAddress[]): ResolvedAddress[] {
  return [
    ...answers.filter((a) => a.family === 4),
    ...answers.filter((a) => a.family !== 4),
  ];
}

async function resolveBoth(
  resolver: FenceResolver,
  host: string,
): Promise<ResolvedAddress[]> {
  const [v4, v6] = await Promise.allSettled([
    resolver.resolve4(host),
    resolver.resolve6(host),
  ]);
  const answers: ResolvedAddress[] = [];
  if (v4.status === "fulfilled")
    for (const address of v4.value) answers.push({ address, family: 4 });
  if (v6.status === "fulfilled")
    for (const address of v6.value) answers.push({ address, family: 6 });
  if (answers.length > 0) return answers;
  const failures = [v4, v6].flatMap((r) =>
    r.status === "rejected" ? [r.reason as unknown] : [],
  );
  throw (
    failures.find((e) => !NO_RECORDS.has(codeOf(e))) ??
    dnsError("ENOTFOUND", host)
  );
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(dnsError("ETIMEOUT", "lookup")), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

function codeOf(error: unknown): string {
  return error instanceof Error && "code" in error ? String(error.code) : "";
}

function dnsError(code: string, host: string): Error {
  return Object.assign(new Error(`${code} ${host}`), { code });
}
