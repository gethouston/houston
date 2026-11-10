import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
// The package root does not export pi's branch selection resolver.
import { getBranchSelection } from "../../../node_modules/@earendil-works/pi-coding-agent/dist/core/virtual-models.js";
import { resumeSessionManager } from "./session-files";
import { SESSION_LOG_ROTATION_BYTES } from "./session-rotation";
import {
  assistant,
  seedRotatableSession,
} from "./session-rotation.test-support";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function setup() {
  const cwd = mkdtempSync(join(tmpdir(), "pi-rotation-branches-"));
  roots.push(cwd);
  return { cwd, dir: join(cwd, "sessions") };
}

test("an off-path branch straddling the cut preserves active context and leaf", () => {
  const { cwd, dir } = setup();
  const manager = SessionManager.create(cwd, dir);
  manager.appendMessage({
    role: "user",
    content: "x".repeat(SESSION_LOG_ROTATION_BYTES + 1024),
    timestamp: 0,
  });
  const shared = manager.appendMessage(assistant());
  const abandoned = manager.appendMessage({
    role: "user",
    content: "off-path prefix",
    timestamp: 1,
  });
  manager.branch(shared);
  const kept = manager.appendMessage({
    role: "user",
    content: "live branch",
    timestamp: 2,
  });
  const checkpoint = manager.appendCompaction("active summary", kept, 100_000);
  manager.branch(abandoned);
  const offPath = manager.appendMessage(assistant("off-path-model"));
  manager.appendCompaction("off-path summary", null, 100_000);
  manager.branch(checkpoint);
  manager.appendMessage({
    role: "user",
    content: "continue live branch",
    timestamp: 3,
  });
  const resumed = resumeSessionManager(cwd, dir, false);
  expect(resumed.getSessionFile()).not.toBe(manager.getSessionFile());
  expect(resumed.buildSessionContext()).toEqual(manager.buildSessionContext());
  expect(resumed.getLeafId()).toBe(manager.getLeafId());
  expect(resumed.getEntry(offPath)?.id).toBe(offPath);
  resumed.appendMessage(assistant("next-model"));
  expect(resumeSessionManager(cwd, dir, false).buildSessionContext()).toEqual(
    resumed.buildSessionContext(),
  );
});

test.each([
  false,
  true,
])("a last pi-virtual assistant preserves context and selection, registered=%s", (registered) => {
  const { cwd, dir } = setup();
  const { manager } = seedRotatableSession(cwd, dir);
  manager.appendMessage({
    ...assistant("virtual-response"),
    api: "pi-virtual",
  });
  const kept = manager.appendMessage({
    role: "user",
    content: "kept",
    timestamp: 2,
  });
  manager.appendCompaction("latest summary", kept, 100_000);
  manager.appendMessage({ role: "user", content: "continue", timestamp: 3 });
  const virtual: Model<Api> = {
    provider: "anthropic",
    id: "selected-model",
    name: "Virtual model",
    api: "pi-virtual",
    baseUrl: "",
    reasoning: false,
    input: ["text"],
    contextWindow: 100_000,
    maxTokens: 1000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  const selection = (session: SessionManager) =>
    getBranchSelection(session.getBranch(), (_provider, modelId) =>
      registered && modelId === virtual.id ? virtual : undefined,
    );
  expect(selection(manager)).toEqual({
    provider: "anthropic",
    modelId: registered ? "selected-model" : "physical-model",
  });
  expect(manager.buildSessionContext().model?.modelId).toBe("virtual-response");
  const resumed = resumeSessionManager(cwd, dir, false);
  expect(resumed.getSessionFile()).not.toBe(manager.getSessionFile());
  expect(resumed.buildSessionContext()).toEqual(manager.buildSessionContext());
  expect(resumed.getLeafId()).toBe(manager.getLeafId());
  expect(selection(resumed)).toEqual(selection(manager));
});
