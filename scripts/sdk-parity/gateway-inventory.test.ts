import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  defaultSources,
  type InventorySources,
  readGatewayInventory,
  readVendoredInventory,
  stampAgeInDays,
} from "./gateway-inventory.ts";
import type { CloudCheckout, ContainsCommit } from "./gateway-sibling.ts";

/**
 * The vendored copy is the verdict in every one of these states, because it is
 * the file CI judges. A cloud checkout only ever adds a line of output.
 */

const SHA = "0".repeat(40);

/** A sandbox with a cloud checkout that a human did NOT name. */
const sandbox = (): InventorySources & { cloud: CloudCheckout } => {
  const dir = mkdtempSync(join(tmpdir(), "gateway-inventory-"));
  const sources = {
    vendored: join(dir, "gateway-routes.generated.json"),
    stamp: join(dir, "gateway-routes.stamp.json"),
    cloud: {
      root: dir,
      routes: join(dir, "routes.generated.json"),
      configured: false,
    },
  };
  writeFileSync(
    sources.stamp,
    JSON.stringify({ cloudSha: SHA, generatedAt: new Date().toISOString() }),
  );
  return sources;
};

const VENDORED = [
  { pattern: "/v1/org", methods: ["GET"], classification: "sdk" },
];
const MOVED = [
  { pattern: "/v1/org", methods: ["GET", "PATCH"], classification: "sdk" },
];
const json = (routes: unknown): string => JSON.stringify(routes, null, 2);

const carriesStamp: ContainsCommit = () => true;
const doesNot: ContainsCommit = () => false;

test("with no cloud checkout the vendored copy is the inventory", () => {
  const sources = { ...sandbox(), cloud: null };
  writeFileSync(sources.vendored, json(VENDORED));
  const inventory = readGatewayInventory(sources);
  expect(inventory.routes).toHaveLength(1);
  expect(inventory.stamp.cloudSha).toBe(SHA);
  expect(inventory.sibling.status).toBe("absent");
  expect(inventory.sibling.notice).toMatch(
    /vendored from cloud 0000000, 0 days old — no cloud checkout/,
  );
});

test("a cloud checkout that agrees says nothing at all", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, json(VENDORED));
  writeFileSync(sources.cloud.routes, json(VENDORED));
  const inventory = readGatewayInventory(sources, doesNot);
  expect(inventory.sibling).toEqual({ status: "agrees", notice: "" });
});

test("a cloud checkout ahead of the stamp warns, and judges nothing", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, json(VENDORED));
  writeFileSync(sources.cloud.routes, json(MOVED));
  const inventory = readGatewayInventory(sources, carriesStamp);
  expect(inventory.sibling.status).toBe("ahead");
  expect(inventory.sibling.notice).toMatch(/^WARNING: /);
  expect(inventory.sibling.notice).toMatch(/pnpm vendor:gateway-routes/);
  // The verdict is the vendored copy's single method, not the checkout's two.
  expect(inventory.routes[0]?.methods).toEqual(["GET"]);
});

test("a cloud checkout on a feature branch is a note, and judges nothing", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, json(VENDORED));
  writeFileSync(sources.cloud.routes, json(MOVED));
  const inventory = readGatewayInventory(sources, doesNot);
  expect(inventory.sibling.status).toBe("elsewhere");
  expect(inventory.sibling.notice).toMatch(/^INFO: /);
  expect(inventory.sibling.notice).toMatch(/does not carry that commit/);
  expect(inventory.routes[0]?.methods).toEqual(["GET"]);
});

// CRLF and a missing final newline are how a Windows checkout or an editor
// rewrites the file; neither changes a single route.
test("line endings alone are not a disagreement", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, `${json(VENDORED)}\n`);
  writeFileSync(sources.cloud.routes, json(VENDORED).replace(/\n/g, "\r\n"));
  expect(readGatewayInventory(sources, doesNot).sibling.status).toBe("agrees");
});

test("a HOUSTON_CLOUD_ROOT that holds no inventory is named, not ignored", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, json(VENDORED));
  const configured = {
    ...sources,
    cloud: { ...sources.cloud, configured: true },
  };
  expect(() => readGatewayInventory(configured)).toThrow(/HOUSTON_CLOUD_ROOT/);
  expect(() => readGatewayInventory(configured)).toThrow(
    /routes\.generated\.json is not there/,
  );
});

test("a HOUSTON_CLOUD_ROOT naming a tree that is not there is a note", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, json(VENDORED));
  const root = join(sources.cloud.root, "never-cloned");
  const inventory = readGatewayInventory({
    ...sources,
    cloud: {
      root,
      routes: join(root, "internal/edge/routes.generated.json"),
      configured: true,
    },
  });
  expect(inventory.sibling.status).toBe("absent");
  expect(inventory.sibling.notice).toMatch(
    /^INFO: HOUSTON_CLOUD_ROOT names .*never-cloned, which is not there/,
  );
});

test("reading the vendored copy alone consults no checkout", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, json(VENDORED));
  const misconfigured = {
    ...sources,
    cloud: { ...sources.cloud, configured: true },
  };
  expect(readVendoredInventory(misconfigured).routes).toHaveLength(1);
});

test("an absent vendored copy is a hard failure, never a skipped rule", () => {
  expect(() => readGatewayInventory(sandbox())).toThrow(/is missing/);
});

test("a stamp that names no cloud commit is refused", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, json(VENDORED));
  writeFileSync(sources.stamp, JSON.stringify({ generatedAt: "2026-01-01" }));
  expect(() => readGatewayInventory(sources)).toThrow(/cloudSha/);
});

test("unparseable JSON names the file it is in", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, "[{,]");
  expect(() => readGatewayInventory(sources)).toThrow(
    `${sources.vendored}: not valid JSON`,
  );
  writeFileSync(sources.vendored, json(VENDORED));
  writeFileSync(sources.stamp, "{");
  expect(() => readGatewayInventory(sources)).toThrow(
    `${sources.stamp}: not valid JSON`,
  );
});

test("an inventory that is not an array names the file it is in", () => {
  const sources = sandbox();
  writeFileSync(sources.vendored, json({ routes: VENDORED }));
  expect(() => readGatewayInventory(sources)).toThrow(/must be an array/);
});

test("the committed inventory and stamp are readable on their own", () => {
  const inventory = readVendoredInventory({ ...defaultSources(), cloud: null });
  expect(inventory.routes.length).toBeGreaterThan(0);
  expect(inventory.stamp.cloudSha).toMatch(/^[0-9a-f]{40}$/);
  for (const route of inventory.routes) {
    expect(route.pattern.startsWith("/"), route.pattern).toBe(true);
    expect(route.methods.length, route.pattern).toBeGreaterThan(0);
  }
});

test("the stamp's age is counted in whole days", () => {
  const stamp = { cloudSha: SHA, generatedAt: "2026-01-01T00:00:00.000Z" };
  expect(stampAgeInDays(stamp, Date.parse("2026-01-04T12:00:00.000Z"))).toBe(3);
  expect(stampAgeInDays(stamp, Date.parse("2025-12-01T00:00:00.000Z"))).toBe(0);
});
