import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { LocalWorkspaceStore } from "../store/local";
import { dispatchAgentOp } from "./dispatch";

async function seed() {
  const root = mkdtempSync(join(tmpdir(), "op-dispatch-"));
  const store = new LocalWorkspaceStore(root);
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "Bob",
  });
  return { root, agent, workspace };
}

test("a routine create runs the REAL route handler against the hydrated tree", async () => {
  const { root, agent } = await seed();
  const res = await dispatchAgentOp({
    workspacesRoot: root,
    agentId: agent.id,
    request: {
      method: "POST",
      rest: "routines",
      contentType: "application/json",
      body: JSON.stringify({
        name: "Daily digest",
        prompt: "Summarize my inbox",
        schedule: "0 9 * * *",
        enabled: true,
      }),
      actingSub: "user-1",
      triggersEnabled: false,
    },
  });
  expect(res.status).toBe(201);
  const created = JSON.parse(res.body) as { id: string; created_by?: string };
  expect(created.created_by).toBe("user-1");
  // The file on the hydrated tree carries it — what sync-back uploads.
  const file = JSON.parse(
    readFileSync(
      join(root, "Personal", "Bob", ".houston", "routines", "routines.json"),
      "utf8",
    ),
  ) as Array<{ id: string }>;
  expect(file.map((r) => r.id)).toEqual([created.id]);
  expect(res.events.map((e) => e.type)).toContain("RoutinesChanged");
});

test("an agentfile PUT writes the file and emits the family event", async () => {
  const { root, agent } = await seed();
  const res = await dispatchAgentOp({
    workspacesRoot: root,
    agentId: agent.id,
    request: {
      method: "PUT",
      rest: "agentfile/.houston/config/config.json",
      contentType: "application/json",
      body: JSON.stringify({
        content: JSON.stringify({ provider: "anthropic" }),
      }),
      triggersEnabled: false,
    },
  });
  expect(res.status).toBe(200);
  expect(
    readFileSync(
      join(root, "Personal", "Bob", ".houston", "config", "config.json"),
      "utf8",
    ),
  ).toBe(JSON.stringify({ provider: "anthropic" }));
  expect(res.events.map((e) => e.type)).toContain("ConfigChanged");
});

test("unknown routes and unknown agents answer without throwing", async () => {
  const { root, agent } = await seed();
  const miss = await dispatchAgentOp({
    workspacesRoot: root,
    agentId: agent.id,
    request: {
      method: "POST",
      rest: "conversations/x/messages",
      triggersEnabled: false,
    },
  });
  expect(miss.status).toBe(404);
  const gone = await dispatchAgentOp({
    workspacesRoot: root,
    agentId: "Personal/Nobody",
    request: { method: "GET", rest: "routines", triggersEnabled: false },
  });
  expect(gone.status).toBe(404);
});
