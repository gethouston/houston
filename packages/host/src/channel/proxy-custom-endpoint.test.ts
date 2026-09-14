import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import { FakeLauncher } from "../launcher/fake";
import { forward } from "../proxy/route";
import { ProxyChannel } from "./proxy";

/**
 * `saveCustomEndpoint` (PRODUCT-1807): the local-model connect must reach the
 * runtime under the ACTING identity (the runtime keys its auth file by
 * credential scope, and every later turn / serve / heal resolves the user's
 * own scope) and must store the endpoint's key centrally like any other
 * api-key connect (a stateless pod loses its local copy at the next recycle;
 * the per-turn serve is the only durable source). Before this, a cloud pod
 * answered "Provider is not configured" 400 ms after a 200 connect.
 */

const ws: Workspace = {
  id: "w1",
  ownerUserId: "alice",
  kind: "personal",
  name: "Personal",
  slug: "alice",
  runtime: "local",
  createdAt: 1,
};
const agent: Agent = { id: "a1", workspaceId: "w1", name: "Sol", createdAt: 1 };
const ACTING = "acting-v1.payload.sig";

let runtime: Server;
let runtimeUrl = "";
let seen: { path: string; headers: Record<string, unknown>; body: string }[] =
  [];
let runtimeStatus = 200;

beforeAll(async () => {
  runtime = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      seen.push({ path: req.url ?? "", headers: { ...req.headers }, body });
      res.writeHead(runtimeStatus, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: runtimeStatus === 200 }));
    });
  });
  await new Promise<void>((r) => runtime.listen(0, "127.0.0.1", () => r()));
  runtimeUrl = `http://127.0.0.1:${(runtime.address() as AddressInfo).port}`;
});

afterAll(() => runtime.close());

function makeChannel() {
  const credentials = new MemoryCredentialStore();
  const channel = new ProxyChannel({
    launcher: new FakeLauncher({ baseUrl: runtimeUrl, token: "sbx" }),
    proxy: { forward },
    credentials,
    forwardActingHeader: true,
  });
  return { channel, credentials };
}

test("forwards the acting identity to the runtime and stores the keyless placeholder under that scope", async () => {
  seen = [];
  runtimeStatus = 200;
  const { channel, credentials } = makeChannel();
  await channel.saveCustomEndpoint(
    { workspace: ws, agent, actingAs: ACTING },
    { baseUrl: "https://tunnel.example/v1", model: "llama3.1" },
  );
  expect(seen).toHaveLength(1);
  expect(seen[0]?.path).toBe("/providers/openai-compatible");
  expect(seen[0]?.headers["x-houston-acting-as"]).toBe(ACTING);
  expect(JSON.parse(seen[0]?.body ?? "{}")).toMatchObject({
    baseUrl: "https://tunnel.example/v1",
    model: "llama3.1",
  });
  const stored = await credentials.get("w1", "openai-compatible", {
    actingAs: ACTING,
  });
  expect(stored).toMatchObject({
    kind: "api_key",
    accessToken: "houston-local",
  });
  // The team scope never learned it: the row belongs to the acting user.
  expect(await credentials.get("w1", "openai-compatible")).toBeNull();
});

test("a user-supplied key is stored verbatim, never replaced by the placeholder", async () => {
  seen = [];
  runtimeStatus = 200;
  const { channel, credentials } = makeChannel();
  await channel.saveCustomEndpoint(
    { workspace: ws, agent },
    { baseUrl: "https://vllm.example/v1", model: "qwen", apiKey: " sk-real " },
  );
  expect(seen[0]?.headers["x-houston-acting-as"]).toBeUndefined();
  expect(await credentials.get("w1", "openai-compatible")).toMatchObject({
    kind: "api_key",
    accessToken: "sk-real",
  });
});

test("a runtime rejection stores nothing centrally", async () => {
  seen = [];
  runtimeStatus = 400;
  const { channel, credentials } = makeChannel();
  await expect(
    channel.saveCustomEndpoint(
      { workspace: ws, agent, actingAs: ACTING },
      { baseUrl: "not a url", model: "x" },
    ),
  ).rejects.toThrow(/could not be connected \(400\)/);
  expect(
    await credentials.get("w1", "openai-compatible", { actingAs: ACTING }),
  ).toBeNull();
});
