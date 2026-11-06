import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostTimezone, setPreference } from "@houston/domain";
import { TurnTimezoneSchema } from "@houston/wire-types";
import { afterEach, expect, test, vi } from "vitest";
import { buildLocalHost } from "./host";
import { createHostBase } from "./host-base";
import { LOCAL_USER } from "./host-log";
import { createHostRuntime } from "./host-runtime";

afterEach(() => vi.unstubAllEnvs());

async function setup(gatewayFronted = false) {
  const home = mkdtempSync(join(tmpdir(), "houston-turn-zone-"));
  const workspacesRoot = join(home, "workspaces");
  mkdirSync(join(workspacesRoot, "Work", "Helper"), { recursive: true });
  const bodies: { timezone?: string }[] = [];
  const receiver = createServer(async (req, res) => {
    if (req.url?.endsWith("/messages")) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      bodies.push(body);
      res.writeHead(
        TurnTimezoneSchema.safeParse(body.timezone).success ? 202 : 400,
      );
    }
    res.end(JSON.stringify({ ok: true, busy: false }));
  });
  await new Promise<void>((r) => receiver.listen(0, "127.0.0.1", r));
  const address = receiver.address();
  if (!address || typeof address === "string") throw new Error("missing port");
  const opts = {
    workspacesRoot,
    credentialsPath: join(home, "credentials.json"),
    token: "test-token",
    port: 0,
    runtimeCommand: ["true"],
    gatewayFronted,
    spawner: { spawn: () => ({ port: address.port, kill() {} }) },
  };
  const base = createHostBase(opts);
  const runtime = createHostRuntime(opts, base);
  const agent = await base.store.getAgent("Work/Helper");
  const workspace = await base.store.getWorkspace("Work");
  if (!agent || !workspace) throw new Error("missing fixture");
  const ctx = { agent, workspace };
  const proxy = createServer((req, res) => {
    void runtime.channel.dispatch(
      ctx,
      "POST",
      "conversations/c1/messages",
      new URL("http://host/conversations/c1/messages"),
      req,
      res,
    );
  });
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
  const proxyAddr = proxy.address();
  if (!proxyAddr || typeof proxyAddr === "string")
    throw new Error("missing port");
  const send = (timezone?: string) =>
    fetch(`http://127.0.0.1:${proxyAddr.port}`, {
      method: "POST",
      body: JSON.stringify({ text: "hello", timezone }),
      headers: { "content-type": "application/json" },
    });
  return {
    base,
    opts,
    bodies,
    send,
    ctx,
    fire: () => runtime.channel.fireTurn(ctx, "c1", "do the work"),
    async close() {
      await runtime.launcher.shutdownAllAndWait(0);
      await Promise.all(
        [proxy, receiver].map(
          (s) => new Promise<void>((r) => s.close(() => r())),
        ),
      );
      rmSync(home, { recursive: true, force: true });
    },
  };
}

test.each([
  { fronted: false, zone: "UTC" },
  { fronted: true, zone: "UTC" },
  { fronted: true, zone: "America/New_York" },
])("production wiring keeps sends and fires in the firing zone, $fronted/$zone", async ({
  fronted,
  zone,
}) => {
  vi.stubEnv("TZ", zone);
  const h = await setup(fronted);
  try {
    await setPreference(h.base.vfs, "Work", "timezone", "Asia/Tokyo");
    const expected = fronted ? hostTimezone() : "Asia/Tokyo";
    expect((await h.send(fronted ? expected : "Europe/Paris")).status).toBe(
      202,
    );
    await h.fire();
    expect((await h.send(fronted ? expected : undefined)).status).toBe(202);
    await h.fire();
    expect(h.bodies.map((b) => b.timezone)).toEqual(Array(4).fill(expected));
    if (fronted) {
      await h.send("America/Bogota");
      expect(h.bodies.at(-1)?.timezone).toBe("America/Bogota");
    }
  } finally {
    await h.close();
  }
});

test.each([
  null,
  "Mars/Olympus",
  "+01:00",
])("unset or invalid stored preference %s keeps local turns valid", async (value) => {
  const h = await setup();
  try {
    await setPreference(h.base.vfs, "Work", "timezone", value);
    expect((await h.send()).status).toBe(202);
    await h.fire();
    expect(h.bodies.map((b) => b.timezone)).toEqual([
      hostTimezone(),
      hostTimezone(),
    ]);
  } finally {
    await h.close();
  }
});

test("preference PUT refuses invalid zones, supports clearing, and the next turn and listing use the saved zone", async () => {
  const h = await setup();
  const host = buildLocalHost(h.opts);
  await new Promise<void>((r) => host.server.listen(0, "127.0.0.1", r));
  const address = host.server.address();
  if (!address || typeof address === "string") throw new Error("missing port");
  const url = `http://127.0.0.1:${address.port}`;
  const headers = {
    authorization: "Bearer test-token",
    "content-type": "application/json",
  };
  const put = (value: unknown, onlyIfAbsent = false) =>
    fetch(`${url}/v1/preferences/timezone`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ value, onlyIfAbsent }),
    });
  try {
    const ws = await h.base.store.getOrCreatePersonalWorkspace(LOCAL_USER);
    for (const onlyIfAbsent of [false, true]) {
      const bad = await put("Mars/Olympus", onlyIfAbsent);
      expect(bad.status).toBe(400);
      expect(await bad.json()).toEqual({
        error: "invalid timezone: expected an IANA name",
      });
    }
    expect((await put("America/Bogota")).status).toBe(200);
    expect(ws.id).toBe(h.ctx.workspace.id);
    const agent = h.ctx.agent;
    const messageUrl = `${url}/agents/${encodeURIComponent(agent.id)}/conversations/c2/messages`;
    expect(
      (
        await fetch(messageUrl, {
          method: "POST",
          headers,
          body: '{"text":"hello"}',
        })
      ).status,
    ).toBe(202);
    expect(h.bodies.at(-1)?.timezone).toBe("America/Bogota");
    const list = await (await fetch(`${url}/agents`, { headers })).json();
    expect(list).toContainEqual(
      expect.objectContaining({ id: agent.id, timezone: "America/Bogota" }),
    );
    await setPreference(h.base.vfs, ws.id, "timezone", "Mars/Olympus");
    expect(
      (
        await fetch(messageUrl, {
          method: "POST",
          headers,
          body: '{"text":"legacy preference"}',
        })
      ).status,
    ).toBe(202);
    expect(h.bodies.at(-1)?.timezone).toBe(hostTimezone());
    expect((await put(null)).status).toBe(200);
    expect(
      (
        await fetch(messageUrl, {
          method: "POST",
          headers,
          body: '{"text":"again"}',
        })
      ).status,
    ).toBe(202);
    expect(h.bodies.at(-1)?.timezone).toBe(hostTimezone());
    const fallbackList = await (
      await fetch(`${url}/agents`, { headers })
    ).json();
    expect(fallbackList).toContainEqual(
      expect.objectContaining({ id: agent.id, timezone: hostTimezone() }),
    );
  } finally {
    await host.stop({ drainMs: 0 });
    await h.close();
  }
});
