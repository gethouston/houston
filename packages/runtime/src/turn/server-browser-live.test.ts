import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterAll, expect, test } from "vitest";
import { parseGrant } from "./parse-turn-fields";
import { createTurnServer } from "./server";
import { buildTurnBrowserTool } from "./turn-toolset";

const server = createTurnServer({
  store: new LocalDirStore(mkdtempSync(join(tmpdir(), "turn-live-"))),
  token: "turn-secret",
  runTurn: async () => ({}),
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => server.close());

const live = (token?: string) =>
  fetch(`${base}/conversations/c-none/browser/live?viewer=viewer-0001`, {
    headers: token ? { "x-internal-token": token } : {},
  });
const input = (token?: string) =>
  fetch(`${base}/conversations/c-none/browser/input`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-internal-token": token } : {}),
    },
    body: "{}",
  });

test("the live view routes need the internal token, then reach the hand-off registry", async () => {
  for (const token of [undefined, "wrong"]) {
    expect((await live(token)).status).toBe(401);
    expect((await input(token)).status).toBe(401);
  }
  for (const response of [
    await live("turn-secret"),
    await input("turn-secret"),
  ]) {
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "no_handoff" });
  }
  const other = await fetch(`${base}/conversations/c-none/messages`, {
    headers: { "x-internal-token": "turn-secret" },
  });
  expect(other.status).toBe(404);
});

test("the grant keeps the browser-live scope and drops ones it does not know", () => {
  const grant = parseGrant({
    url: "https://gateway.test/",
    token: "t",
    expires: 1,
    scopes: ["browser-live", "teleport", "code-run"],
  });
  expect(grant.scopes).toEqual(["browser-live", "code-run"]);
});

test("a turn's browser offers handoff only with the browser-live grant", () => {
  const actions = (liveView: boolean) => {
    const [tool] = buildTurnBrowserTool(
      { toolNames: ["browser"], includeRunCode: false },
      "/ws/Agent",
      liveView,
      undefined,
    );
    const schema = tool?.parameters as unknown as {
      properties: { action: { anyOf: { const: string }[] } };
    };
    return schema.properties.action.anyOf.map((option) => option.const);
  };
  expect(actions(true)).toContain("handoff");
  expect(actions(false)).not.toContain("handoff");
  expect(
    buildTurnBrowserTool(
      { toolNames: ["run_code"], includeRunCode: true },
      "/ws",
      true,
      undefined,
    ),
  ).toEqual([]);
});
