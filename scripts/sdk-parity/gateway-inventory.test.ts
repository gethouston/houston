import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  defaultSources,
  type InventorySources,
  readGatewayInventory,
  stampAgeInDays,
  VENDORED_ROUTES,
  VENDORED_STAMP,
} from "./gateway-inventory.ts";

/**
 * The four states the resolver can be in. The committed files are the fixture
 * for the first two, because the copy this repo ships IS what CI judges.
 */

const SHA = "0".repeat(40);

const sandbox = (): InventorySources => {
  const dir = mkdtempSync(join(tmpdir(), "gateway-inventory-"));
  const sources = {
    vendored: join(dir, "gateway-routes.generated.json"),
    stamp: join(dir, "gateway-routes.stamp.json"),
    cloud: join(dir, "routes.generated.json"),
  };
  writeFileSync(
    sources.stamp,
    JSON.stringify({ cloudSha: SHA, generatedAt: new Date().toISOString() }),
  );
  return sources;
};

const ROUTES = JSON.stringify([
  { pattern: "/v1/org", methods: ["GET"], classification: "sdk" },
]);

test("with no cloud checkout the vendored copy is the inventory", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, ROUTES);
  const inventory = readGatewayInventory(sources);
  expect(inventory.source).toBe("vendored");
  expect(inventory.routes).toHaveLength(1);
  expect(inventory.stamp.cloudSha).toBe(SHA);
});

test("a cloud checkout that agrees is read as the authoritative source", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, ROUTES);
  writeFileSync(sources.cloud, ROUTES);
  expect(readGatewayInventory(sources).source).toBe("cloud-checkout");
});

test("a cloud checkout that disagrees demands a re-vendor", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, ROUTES);
  writeFileSync(
    sources.cloud,
    JSON.stringify([
      { pattern: "/v1/org", methods: ["GET", "PATCH"], classification: "sdk" },
    ]),
  );
  expect(() => readGatewayInventory(sources)).toThrow(
    /vendored gateway inventory is behind your cloud checkout/,
  );
});

// CRLF and a missing final newline are how a Windows checkout or an editor
// rewrites the file; neither changes a single route.
test("line endings alone are not a disagreement", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, `${ROUTES}\n`);
  writeFileSync(sources.cloud, ROUTES.replace(/\n/g, "\r\n"));
  expect(readGatewayInventory(sources).source).toBe("cloud-checkout");
});

test("an absent vendored copy is a hard failure, never a skipped rule", () => {
  const sources = sandbox();
  expect(() => readGatewayInventory(sources)).toThrow(/is missing/);
});

test("a stamp that names no cloud commit is refused", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, ROUTES);
  writeFileSync(sources.stamp, JSON.stringify({ generatedAt: "2026-01-01" }));
  expect(() => readGatewayInventory(sources)).toThrow(/cloudSha/);
});

test("the committed inventory and stamp are readable on their own", () => {
  const sources = { ...defaultSources(), cloud: join(tmpdir(), "absent.json") };
  const inventory = readGatewayInventory(sources);
  expect(inventory.source).toBe("vendored");
  expect(inventory.routes.length).toBeGreaterThan(0);
  for (const route of inventory.routes) {
    expect(route.pattern.startsWith("/"), route.pattern).toBe(true);
    expect(route.methods.length, route.pattern).toBeGreaterThan(0);
  }
});

test("the committed copy is byte-identical to what the stamp claims", () => {
  const sources = sandbox();
  copyFileSync(VENDORED_ROUTES, sources.vendored);
  copyFileSync(VENDORED_STAMP, sources.stamp);
  copyFileSync(VENDORED_ROUTES, sources.cloud);
  expect(readGatewayInventory(sources).source).toBe("cloud-checkout");
});

test("the stamp's age is counted in whole days", () => {
  const stamp = { cloudSha: SHA, generatedAt: "2026-01-01T00:00:00.000Z" };
  expect(stampAgeInDays(stamp, Date.parse("2026-01-04T12:00:00.000Z"))).toBe(3);
  expect(stampAgeInDays(stamp, Date.parse("2025-12-01T00:00:00.000Z"))).toBe(0);
});
