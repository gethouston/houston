import { test, expect } from "bun:test";
import type { Agent } from "../domain/types";
import { FakeLauncher } from "./fake";

function agent(id: string): Agent {
  return { id, workspaceId: "ws-1", name: `Agent ${id}`, createdAt: Date.now() };
}

test("absent before anything happens", async () => {
  const sb = new FakeLauncher();
  expect(await sb.status("never-seen")).toBe("absent");
});

test("ensureAwake -> running -> sleep -> asleep -> destroy -> absent", async () => {
  const sb = new FakeLauncher();
  const a = agent("a1");

  const ep = await sb.ensureAwake(a);
  expect(ep.baseUrl).toBe("http://127.0.0.1:4317");
  expect(ep.token).toBe("fake-sandbox-token");
  expect(await sb.status(a.id)).toBe("running");

  await sb.sleep(a.id);
  expect(await sb.status(a.id)).toBe("asleep");

  await sb.destroy(a.id);
  expect(await sb.status(a.id)).toBe("absent");
});

test("ensureAwake is idempotent and wakes a slept sandbox", async () => {
  const sb = new FakeLauncher();
  const a = agent("a2");

  await sb.ensureAwake(a);
  await sb.sleep(a.id);
  expect(await sb.status(a.id)).toBe("asleep");

  await sb.ensureAwake(a);
  expect(await sb.status(a.id)).toBe("running");

  // calling ensureAwake again keeps it running
  await sb.ensureAwake(a);
  expect(await sb.status(a.id)).toBe("running");
});

test("configurable endpoint via constructor and env default", async () => {
  const sb = new FakeLauncher({ baseUrl: "http://10.0.0.5:9000", token: "tok-xyz" });
  const ep = await sb.ensureAwake(agent("a3"));
  expect(ep).toEqual({ baseUrl: "http://10.0.0.5:9000", token: "tok-xyz" });
});

test("sleeping an unknown agent surfaces an error (no silent absent)", async () => {
  const sb = new FakeLauncher();
  await expect(sb.sleep("ghost")).rejects.toThrow(/unknown agent ghost/);
});

test("destroy is idempotent (absent stays absent)", async () => {
  const sb = new FakeLauncher();
  const a = agent("a4");
  await sb.ensureAwake(a);
  await sb.destroy(a.id);
  await sb.destroy(a.id, { dropVolume: true });
  expect(await sb.status(a.id)).toBe("absent");
});

test("independent agents track state separately", async () => {
  const sb = new FakeLauncher();
  const a = agent("a5");
  const b = agent("b5");
  await sb.ensureAwake(a);
  await sb.ensureAwake(b);
  await sb.sleep(a.id);
  expect(await sb.status(a.id)).toBe("asleep");
  expect(await sb.status(b.id)).toBe("running");
});
