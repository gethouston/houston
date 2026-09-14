import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readEmbeddedCatalog } from "@houston/host/src/assistant/catalog-source";
import { expect, test, vi } from "vitest";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import { runWithTurnMode, type TurnModeRef } from "../turn-mode-context";
import { makeCoordinatorCredentialTool } from "./coordinator-credential";
import type { SandboxFetch } from "./sandbox-fetch";

const loadedCatalog = readEmbeddedCatalog();
if (!loadedCatalog) throw new Error("missing catalog");
const catalog = loadedCatalog;
const ctx = {} as ExtensionContext;

function setup(payload: unknown, status = 200) {
  const call = vi.fn<SandboxFetch>(async () =>
    Response.json(status === 200 ? { items: payload } : payload, { status }),
  );
  const tool = makeCoordinatorCredentialTool({ catalog, call });
  return {
    call,
    run: () =>
      tool.execute("id", { toolkit: " Acme " }, undefined, undefined, ctx),
  };
}

test("preflight uses the catalogued assistant read, then queues a secure card", async () => {
  const { call, run } = setup([{ slug: "acme", state: { status: "pending" } }]);
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, run);
  expect(call).toHaveBeenCalledTimes(1);
  const first = call.mock.calls[0];
  if (!first) throw new Error("missing preflight");
  const [path, init] = first;
  expect(path).toBe("/sandbox/assistant/call");
  expect(JSON.parse(String(init?.body))).toEqual({
    operation: "customIntegrations",
    params: {},
  });
  expect(holder.pending?.steps).toEqual([
    { kind: "credential", id: "k1", toolkit: "acme" },
  ]);
});

test.each([
  { payload: [], error: "No custom integration" },
  {
    payload: [
      { slug: "acme", state: { status: "error", message: "bad spec" } },
    ],
    error: "bad spec",
  },
  { payload: [{ slug: "acme", state: null }], error: "unreadable" },
])("refuses missing or unusable definitions: $error", async ({
  payload,
  error,
}) => {
  const { run } = setup(payload);
  const holder = newInteractionHolder();
  await expect(runWithInteractionCapture(holder, run)).rejects.toThrow(error);
  expect(holder.pending).toBeUndefined();
});

test("a denied read does not queue a card", async () => {
  const { run } = setup({ error: "denied" }, 403);
  const holder = newInteractionHolder();
  await expect(runWithInteractionCapture(holder, run)).rejects.toThrow();
  expect(holder.pending).toBeUndefined();
});

test("Plan is checked before and after the asynchronous preflight", async () => {
  const mode: TurnModeRef = { current: "execute" };
  const call: SandboxFetch = async () => {
    mode.current = "plan";
    return Response.json({
      items: [{ slug: "acme", state: { status: "pending" } }],
    });
  };
  const tool = makeCoordinatorCredentialTool({ catalog, call });
  const holder = newInteractionHolder();
  await expect(
    runWithTurnMode(mode, () =>
      runWithInteractionCapture(holder, () =>
        tool.execute("id", { toolkit: "acme" }, undefined, undefined, ctx),
      ),
    ),
  ).rejects.toThrow("Plan mode");
  expect(holder.pending).toBeUndefined();
  const untouched = setup([]);
  await expect(runWithTurnMode(mode, untouched.run)).rejects.toThrow(
    "Plan mode",
  );
  expect(untouched.call).not.toHaveBeenCalled();
});

test("refuses an unexpected list envelope instead of queuing a card blind", async () => {
  const tool = makeCoordinatorCredentialTool({
    catalog,
    call: async () =>
      Response.json([{ slug: "acme", state: { status: "pending" } }]),
  });
  await expect(
    tool.execute("id", { toolkit: "acme" }, undefined, undefined, ctx),
  ).rejects.toThrow("unreadable custom integration list");
});
