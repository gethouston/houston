import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMigrationPlan,
  chunkPaths,
  collectIntegrations,
  hasReconnectAppsStep,
  isPlausibleMigrationTarget,
  type SourceAgent,
  type SourceManifestEntry,
} from "../src/lib/cloud-migration.ts";
import { initialProgress } from "../src/lib/cloud-migration-progress.ts";

function agent(
  workspace: string,
  name: string,
  integrations: string[] = [],
): SourceAgent {
  return {
    id: `${workspace}/${name}`,
    workspaceId: workspace,
    name,
    manifest: { entries: [], excluded: [], integrations, totalBytes: 0 },
  };
}

// ── buildMigrationPlan ────────────────────────────────────────────────

test("keeps plain names when nothing collides", () => {
  const plan = buildMigrationPlan([agent("Work", "Sales")], []);
  assert.equal(plan[0].targetName, "Sales");
  assert.equal(plan[0].alreadyDone, false);
});

test("flattening two workspaces with the same agent name renames the second", () => {
  const plan = buildMigrationPlan(
    [agent("Work", "Sales"), agent("Personal", "Sales")],
    [],
  );
  assert.deepEqual(
    plan.map((t) => t.targetName),
    ["Sales", "Sales (Personal)"],
  );
});

test("collision with an existing cloud agent renames with the workspace", () => {
  const plan = buildMigrationPlan(
    [agent("Work", "Sales")],
    [{ name: "Sales" }],
  );
  assert.equal(plan[0].targetName, "Sales (Work)");
});

test("collisions are case-insensitive", () => {
  const plan = buildMigrationPlan(
    [agent("Work", "Sales")],
    [{ name: "sales" }],
  );
  assert.equal(plan[0].targetName, "Sales (Work)");
});

test("exhausted workspace suffix falls back to numbered names", () => {
  const plan = buildMigrationPlan(
    [agent("Work", "Sales")],
    [{ name: "Sales" }, { name: "Sales (Work)" }, { name: "Sales (Work) 2" }],
  );
  assert.equal(plan[0].targetName, "Sales (Work) 3");
});

test("a matching import marker resumes: task is alreadyDone, no rename churn", () => {
  const plan = buildMigrationPlan(
    [agent("Work", "Sales"), agent("Personal", "Sales")],
    [{ name: "Sales", importedSource: { workspace: "Work", agent: "Sales" } }],
  );
  assert.equal(plan[0].alreadyDone, true);
  assert.equal(plan[0].targetName, "Sales");
  // The second source agent still collides with the finished one's name.
  assert.equal(plan[1].alreadyDone, false);
  assert.equal(plan[1].targetName, "Sales (Personal)");
  // And resume feeds the initial progress state machine.
  assert.equal(initialProgress(plan[0]).step, "done");
  assert.equal(initialProgress(plan[1]).step, "pending");
});

test("a marker for a DIFFERENT source does not resume", () => {
  const plan = buildMigrationPlan(
    [agent("Work", "Sales")],
    [{ name: "Sales", importedSource: { workspace: "Play", agent: "Sales" } }],
  );
  assert.equal(plan[0].alreadyDone, false);
  assert.equal(plan[0].targetName, "Sales (Work)");
});

// ── chunkPaths ────────────────────────────────────────────────────────

const entry = (
  path: string,
  size: number,
  kind: "core" | "file" = "file",
): SourceManifestEntry => ({ path, size, kind });

test("packs entries greedily under the byte budget", () => {
  const chunks = chunkPaths(
    [entry("a", 40), entry("b", 50), entry("c", 20)],
    100,
  );
  assert.deepEqual(
    chunks.map((c) => c.paths),
    [["a", "b"], ["c"]],
  );
  assert.deepEqual(
    chunks.map((c) => c.bytes),
    [90, 20],
  );
});

test("core entries upload before working files", () => {
  const chunks = chunkPaths(
    [entry("big.pdf", 80), entry(".houston/memory.md", 10, "core")],
    100,
  );
  assert.deepEqual(chunks[0].paths, [".houston/memory.md", "big.pdf"]);
});

test("an entry over the budget rides alone instead of being dropped", () => {
  const chunks = chunkPaths(
    [entry("a", 10), entry("huge", 500), entry("b", 10)],
    100,
  );
  assert.deepEqual(
    chunks.map((c) => c.paths),
    [["a"], ["huge"], ["b"]],
  );
});

test("no entries → no chunks (nothing to upload)", () => {
  assert.deepEqual(chunkPaths([], 100), []);
});

// ── isPlausibleMigrationTarget ────────────────────────────────────────

test("resume probes only agents whose name a migration could have produced", () => {
  const sources = [{ name: "Sales" }];
  assert.equal(isPlausibleMigrationTarget("Sales", sources), true);
  assert.equal(isPlausibleMigrationTarget("sales (Work) 2", sources), true);
  assert.equal(isPlausibleMigrationTarget("Salesforce", sources), false);
  assert.equal(isPlausibleMigrationTarget("Marketing", sources), false);
});

// ── collectIntegrations ───────────────────────────────────────────────

test("collects the sorted union of toolkit slugs across agents", () => {
  const slugs = collectIntegrations([
    agent("Work", "Sales", ["gmail", "slack"]),
    agent("Personal", "Helper", ["slack", "googlecalendar"]),
  ]);
  assert.deepEqual(slugs, ["gmail", "googlecalendar", "slack"]);
});

test("account-level legacy Composio slugs union into the checklist", () => {
  // The v0.4.x cohort: no per-agent records, connections only in the
  // consumer account probed via ~/.composio.
  assert.deepEqual(collectIntegrations([], ["googledrive", "gmail"]), [
    "gmail",
    "googledrive",
  ]);
  // Both sources present: dedupe across them.
  assert.deepEqual(
    collectIntegrations(
      [agent("Work", "Sales", ["gmail"])],
      ["gmail", "slack"],
    ),
    ["gmail", "slack"],
  );
});

// ── hasReconnectAppsStep ──────────────────────────────────────────────

test("the apps step is skipped when there is nothing to show", () => {
  // The common v0.4.2x case: platform-mode integrations leave no per-agent
  // record, and a clean migration has no leftovers → no empty-shell step.
  assert.equal(
    hasReconnectAppsStep({
      integrations: 0,
      failedAgents: 0,
      excludedFiles: 0,
      rejectedFiles: 0,
    }),
    false,
  );
});

test("the apps step shows for integrations OR any leftover kind", () => {
  const none = {
    integrations: 0,
    failedAgents: 0,
    excludedFiles: 0,
    rejectedFiles: 0,
  };
  assert.equal(hasReconnectAppsStep({ ...none, integrations: 2 }), true);
  assert.equal(hasReconnectAppsStep({ ...none, failedAgents: 1 }), true);
  assert.equal(hasReconnectAppsStep({ ...none, excludedFiles: 1 }), true);
  assert.equal(hasReconnectAppsStep({ ...none, rejectedFiles: 1 }), true);
});
