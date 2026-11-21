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

const here = dirname(fileURLToPath(import.meta.url));

export interface GatewayRoute {
  pattern: string;
  methods: string[];
  classification: string;
  reason?: string;
}

export interface GatewayStamp {
  cloudSha: string;
  generatedAt: string;
}

export interface VendoredInventory {
  routes: GatewayRoute[];
  stamp: GatewayStamp;
}

export interface GatewayInventory extends VendoredInventory {
  sibling: SiblingCheck;
}

export const VENDORED_ROUTES = resolve(here, "gateway-routes.generated.json");
export const VENDORED_STAMP = resolve(here, "gateway-routes.stamp.json");

export interface InventorySources {
  vendored: string;
  stamp: string;
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

export function readVendoredInventory(
  sources: InventorySources = defaultSources(),
): VendoredInventory {
  const vendored = readVendoredText(sources.vendored);
  return {
    routes: parseRoutes(vendored, sources.vendored),
    stamp: readStamp(sources.stamp),
  };
}

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
