import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where the gateway's route inventory comes from.
 *
 * The gateway lives in the PRIVATE `gethouston/cloud` repo, and this repo's CI
 * holds no token for it — so the inventory is VENDORED here: a byte-identical
 * copy of `cloud/internal/edge/routes.generated.json` plus a stamp naming the
 * cloud commit it came from. Cloud's own CI opens the PR that refreshes it
 * whenever the inventory moves, and this repo's gate judges the copy.
 *
 * A checkout of `cloud` beside this repo (or at `HOUSTON_CLOUD_ROOT`) is
 * authoritative when present, and must AGREE with the vendored copy: a
 * developer whose gateway routes moved is told to re-vendor rather than
 * allowed to judge one file while CI judges another.
 */

const here = dirname(fileURLToPath(import.meta.url));

/** One gateway route, as `cloud` exports it. */
export interface GatewayRoute {
  pattern: string;
  /** Explicit because the gateway dispatches methods inside its handlers. */
  methods: string[];
  classification: string;
  reason?: string;
}

/** The cloud commit the vendored copy was taken from, and when. */
export interface GatewayStamp {
  cloudSha: string;
  generatedAt: string;
}

export interface GatewayInventory {
  routes: GatewayRoute[];
  /** `vendored` means no cloud checkout was there to cross-check it against. */
  source: "cloud-checkout" | "vendored";
  stamp: GatewayStamp;
}

/** The checked-in copy and its stamp, written by `pnpm vendor:gateway-routes`. */
export const VENDORED_ROUTES = resolve(here, "gateway-routes.generated.json");
export const VENDORED_STAMP = resolve(here, "gateway-routes.stamp.json");

/** The sibling cloud checkout; HOUSTON_CLOUD_ROOT overrides the default. */
export const cloudCheckoutRoot = (): string =>
  resolve(process.env.HOUSTON_CLOUD_ROOT ?? resolve(here, "../../../cloud"));

export const cloudCheckoutRoutes = (): string =>
  resolve(cloudCheckoutRoot(), "internal/edge/routes.generated.json");

/** The three files the resolution order reads, overridable for tests. */
export interface InventorySources {
  vendored: string;
  stamp: string;
  cloud: string;
}

export const defaultSources = (): InventorySources => ({
  vendored: VENDORED_ROUTES,
  stamp: VENDORED_STAMP,
  cloud: cloudCheckoutRoutes(),
});

/** Line endings and the trailing newline are checkout artefacts, not content. */
const canonical = (text: string): string =>
  text.replace(/\r\n/g, "\n").trimEnd();

const parseRoutes = (text: string, at: string): GatewayRoute[] => {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed))
    throw new Error(`${at}: the gateway route inventory must be an array`);
  return parsed as GatewayRoute[];
};

function readStamp(at: string): GatewayStamp {
  if (!existsSync(at))
    throw new Error(
      `${at} is missing. The vendored inventory is only readable with the cloud commit it came from — re-vendor with \`pnpm vendor:gateway-routes\`.`,
    );
  const parsed = JSON.parse(readFileSync(at, "utf8")) as Partial<GatewayStamp>;
  if (
    typeof parsed.cloudSha !== "string" ||
    !/^[0-9a-f]{40}$/.test(parsed.cloudSha)
  )
    throw new Error(
      `${at}: cloudSha must be the 40-character gethouston/cloud commit the inventory was taken from`,
    );
  if (
    typeof parsed.generatedAt !== "string" ||
    Number.isNaN(Date.parse(parsed.generatedAt))
  )
    throw new Error(`${at}: generatedAt must be an ISO timestamp`);
  return { cloudSha: parsed.cloudSha, generatedAt: parsed.generatedAt };
}

/** Whole days between the vendoring and `now`. */
export const stampAgeInDays = (
  stamp: GatewayStamp,
  now: number = Date.now(),
): number =>
  Math.max(0, Math.floor((now - Date.parse(stamp.generatedAt)) / 86_400_000));

/**
 * The gateway's declared routes. Never null and never a blind spot: the copy
 * is checked in, so every rule is judged on every run.
 */
export function readGatewayInventory(
  sources: InventorySources = defaultSources(),
): GatewayInventory {
  if (!existsSync(sources.vendored))
    throw new Error(
      `${sources.vendored} is missing. The gate's input is checked in; it cannot legitimately be absent — restore it from git, or re-vendor it from a cloud checkout with \`pnpm vendor:gateway-routes\`.`,
    );
  const vendored = readFileSync(sources.vendored, "utf8");
  const stamp = readStamp(sources.stamp);
  if (!existsSync(sources.cloud))
    return {
      routes: parseRoutes(vendored, sources.vendored),
      source: "vendored",
      stamp,
    };
  const cloud = readFileSync(sources.cloud, "utf8");
  if (canonical(cloud) !== canonical(vendored))
    throw new Error(
      `vendored gateway inventory is behind your cloud checkout: re-vendor with \`pnpm vendor:gateway-routes\` (${sources.vendored} differs from ${sources.cloud}).`,
    );
  return {
    routes: parseRoutes(cloud, sources.cloud),
    source: "cloud-checkout",
    stamp,
  };
}
