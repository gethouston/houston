import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkPaths,
  collectIntegrations,
  doneScreenOutcome,
  hasReconnectAppsStep,
  MAX_CHUNK_RAW_BYTES,
  type SourceAgent,
  type SourceManifestEntry,
} from "../src/lib/cloud-migration.ts";
import {
  buildMigrationPlan,
  isPlausibleMigrationTarget,
  migratedAgentCreate,
} from "../src/lib/cloud-migration-plan.ts";
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

test("keeps plain names when nothing collides", () => {
  const plan = buildMigrationPlan([agent("Work", "Sales")], []);
  assert.equal(plan[0].targetName, "Sales");
  assert.equal(plan[0].alreadyDone, false);
});

test("an employee named Houston moves in under its own name", () => {
  const plan = buildMigrationPlan([agent("Work", "Houston")], []);
  assert.equal(plan[0].targetName, "Houston");
  assert.deepEqual(migratedAgentCreate({ ...plan[0], color: "teal" }), {
    name: "Houston",
    configId: "personal-assistant",
    color: "teal",
    migration: true,
  });
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

test("threads a source agent's color onto its task", () => {
  const src: SourceAgent = { ...agent("Work", "Sales"), color: "#ff0000" };
  const plan = buildMigrationPlan([src], []);
  assert.equal(plan[0].color, "#ff0000");
});

test("color lands on the right task when names collide (per-agent, not shared)", () => {
  const a: SourceAgent = { ...agent("Work", "Sales"), color: "#aa0000" };
  const b: SourceAgent = { ...agent("Personal", "Sales"), color: "#00bb00" };
  const plan = buildMigrationPlan([a, b], []);
  assert.equal(plan[0].color, "#aa0000");
  assert.equal(plan[1].color, "#00bb00");
  assert.equal(plan[1].targetName, "Sales (Personal)");
});

test("a colorless source agent yields an undefined task color (create defaults)", () => {
  const plan = buildMigrationPlan([agent("Work", "Sales")], []);
  assert.equal(plan[0].color, undefined);
});

test("a resumed (alreadyDone) task still carries its color", () => {
  const src: SourceAgent = { ...agent("Work", "Sales"), color: "#123456" };
  const plan = buildMigrationPlan(
    [src],
    [{ name: "Sales", importedSource: { workspace: "Work", agent: "Sales" } }],
  );
  assert.equal(plan[0].alreadyDone, true);
  assert.equal(plan[0].color, "#123456");
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

test("collisions compare names as the host does, whatever the Unicode form", () => {
  const plan = buildMigrationPlan(
    [agent("Work", "Jose\u0301")],
    [{ name: "jos\u00e9" }],
  );
  assert.equal(plan[0].targetName, "Jose\u0301 (Work)");
  assert.equal(
    isPlausibleMigrationTarget("jos\u00e9 (Work)", [{ name: "Jose\u0301" }]),
    true,
  );
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
  assert.equal(plan[1].alreadyDone, false);
  assert.equal(plan[1].targetName, "Sales (Personal)");
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

const entry = (
  path: string,
  size: number,
  kind: "core" | "file" = "file",
): SourceManifestEntry => ({ path, size, kind });

test("a chunk uploads within the ingress body deadline on a 2 Mbps uplink", () => {
  const bytesPerSecondAt2Mbps = (2 * 1_000_000) / 8;
  const seconds = MAX_CHUNK_RAW_BYTES / bytesPerSecondAt2Mbps;
  assert.ok(seconds < 45, `a chunk takes ${seconds.toFixed(0)}s at 2 Mbps`);
});

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

test("resume probes only agents whose name a migration could have produced", () => {
  const sources = [{ name: "Sales" }];
  assert.equal(isPlausibleMigrationTarget("Sales", sources), true);
  assert.equal(isPlausibleMigrationTarget("sales (Work) 2", sources), true);
  assert.equal(isPlausibleMigrationTarget("Salesforce", sources), false);
  assert.equal(isPlausibleMigrationTarget("Marketing", sources), false);
});

test("collects the sorted union of toolkit slugs across agents", () => {
  const slugs = collectIntegrations([
    agent("Work", "Sales", ["gmail", "slack"]),
    agent("Personal", "Helper", ["slack", "googlecalendar"]),
  ]);
  assert.deepEqual(slugs, ["gmail", "googlecalendar", "slack"]);
});

test("account-level legacy Composio slugs union into the checklist", () => {
  assert.deepEqual(collectIntegrations([], ["googledrive", "gmail"]), [
    "gmail",
    "googledrive",
  ]);
  assert.deepEqual(
    collectIntegrations(
      [agent("Work", "Sales", ["gmail"])],
      ["gmail", "slack"],
    ),
    ["gmail", "slack"],
  );
});

test("the apps step is skipped when there is nothing to show", () => {
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

test("a clean run stamps done — the wizard and Settings row both retire", () => {
  assert.equal(doneScreenOutcome(0), "done");
});

test("a run with failed agents stamps skipped so Settings keeps the retry", () => {
  assert.equal(doneScreenOutcome(1), "skipped");
  assert.equal(doneScreenOutcome(5), "skipped");
});
