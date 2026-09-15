import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CloudCheckout,
  type ContainsCommit,
  compareSibling,
  defaultCheckout,
  gitContainsCommit,
  type SiblingCheck,
} from "./gateway-sibling.ts";

/**
 * Where the gateway's route inventory comes from.
 *
 * The gateway lives in the PRIVATE `gethouston/cloud` repo, and this repo's CI
 * holds no token for it — so the inventory is VENDORED here: a byte-identical
 * copy of `cloud/internal/edge/routes.generated.json` plus a stamp naming the
 * cloud commit it came from. Cloud's own CI opens the PR that refreshes it
 * whenever the inventory moves.
 *
 * The vendored copy is what EVERY run judges, developer and CI alike: one
 * verdict, reproducible from this repo alone. A `cloud` checkout beside this
 * repo is only consulted, and only to report on the copy's freshness — see
 * `./gateway-sibling.ts`.
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

/** The routes the gate judges, and where they came from. */
export interface VendoredInventory {
  routes: GatewayRoute[];
  stamp: GatewayStamp;
}

export interface GatewayInventory extends VendoredInventory {
  sibling: SiblingCheck;
}

/** The checked-in copy and its stamp, written by `pnpm vendor:gateway-routes`. */
export const VENDORED_ROUTES = resolve(here, "gateway-routes.generated.json");
export const VENDORED_STAMP = resolve(here, "gateway-routes.stamp.json");

/** The files the resolver reads, overridable for tests. */
export interface InventorySources {
  vendored: string;
  stamp: string;
  /** The checkout to consult, or null to consult none. */
  cloud: CloudCheckout | null;
}

export const defaultSources = (): InventorySources => ({
  vendored: VENDORED_ROUTES,
  stamp: VENDORED_STAMP,
  cloud: defaultCheckout(),
});

const parseJson = (text: string, at: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new Error(`${at}: not valid JSON — ${(cause as Error).message}`, {
      cause,
    });
  }
};

const parseRoutes = (text: string, at: string): GatewayRoute[] => {
  const parsed = parseJson(text, at);
  if (!Array.isArray(parsed))
    throw new Error(`${at}: the gateway route inventory must be an array`);
  return parsed as GatewayRoute[];
};

function readStamp(at: string): GatewayStamp {
  if (!existsSync(at))
    throw new Error(
      `${at} is missing. The vendored inventory is only readable with the cloud commit it came from — re-vendor with \`pnpm vendor:gateway-routes\`.`,
    );
  const parsed = parseJson(
    readFileSync(at, "utf8"),
    at,
  ) as Partial<GatewayStamp>;
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

function readVendoredText(at: string): string {
  if (!existsSync(at))
    throw new Error(
      `${at} is missing. The gate's input is checked in; it cannot legitimately be absent — restore it from git, or re-vendor it from a cloud checkout with \`pnpm vendor:gateway-routes\`.`,
    );
  return readFileSync(at, "utf8");
}

/**
 * The gateway's declared routes. Never null and never a blind spot: the copy
 * is checked in, so every rule is judged on every run — and no cloud checkout
 * is consulted, so no local branch can make this throw.
 */
export function readVendoredInventory(
  sources: InventorySources = defaultSources(),
): VendoredInventory {
  const vendored = readVendoredText(sources.vendored);
  return {
    routes: parseRoutes(vendored, sources.vendored),
    stamp: readStamp(sources.stamp),
  };
}

/** The same routes, plus what a `cloud` checkout beside this repo says. */
export function readGatewayInventory(
  sources: InventorySources = defaultSources(),
  containsCommit: ContainsCommit = gitContainsCommit,
): GatewayInventory {
  const vendored = readVendoredText(sources.vendored);
  const stamp = readStamp(sources.stamp);
  return {
    routes: parseRoutes(vendored, sources.vendored),
    stamp,
    sibling: compareSibling(
      vendored,
      { cloudSha: stamp.cloudSha, ageInDays: stampAgeInDays(stamp) },
      sources.cloud,
      containsCommit,
    ),
  };
}
