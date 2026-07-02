import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import { FakeLauncher } from "../launcher/fake";
import type { ChannelCtx } from "../ports";
import { forward } from "../proxy/route";
import { ProxyChannel } from "./proxy";

/**
 * The acting-as trust seam (C2): the `x-houston-acting-as` header is relayed
 * to the runtime ONLY behind a trusted gateway (`forwardActingHeader: true`,
 * the cloud wiring). The local profile sets false — clients reach the host
 * directly there, so an inbound header is untrusted input and forwarding it
 * would let any client forge message attribution. The routine path
 * (server-minted `x-houston-acting-user` on fireTurn) is independent of the
 * flag and must flow in both configurations.
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
const ctx: ChannelCtx = { workspace: ws, agent };

// A fake runtime that records the headers of every request it receives.
let runtime: Server;
let runtimeUrl = "";
let seenHeaders: Record<string, string | string[] | undefined>[] = [];

beforeAll(async () => {
  runtime = createServer((req, res) => {
    seenHeaders.push({ ...req.headers });
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((r) => runtime.listen(0, "127.0.0.1", () => r()));
  runtimeUrl = `http://127.0.0.1:${(runtime.address() as AddressInfo).port}`;
});

afterAll(() => runtime.close());

function makeChannel(forwardActingHeader: boolean): ProxyChannel {
  return new ProxyChannel({
    launcher: new FakeLauncher({ baseUrl: runtimeUrl, token: "sbx" }),
    proxy: { forward },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader,
  });
}

/** Serve dispatch over real HTTP so a CLIENT-supplied header rides req.headers. */
function serve(
  channel: ProxyChannel,
): Promise<{ base: string; close(): void }> {
  const s = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    const rest = url.pathname.replace(/^\//, "");
    void channel
      .dispatch(ctx, req.method || "GET", rest, url, req, res)
      .catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
  });
  return new Promise((resolve) =>
    s.listen(0, "127.0.0.1", () =>
      resolve({
        base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`,
        close: () => s.close(),
      }),
    ),
  );
}

async function dispatchWithHeader(channel: ProxyChannel) {
  seenHeaders = [];
  const { base, close } = await serve(channel);
  try {
    await fetch(`${base}/conversations/c1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-houston-acting-as": "acting-v1.forged-payload.sig",
      },
      body: JSON.stringify({ text: "hi" }),
    });
  } finally {
    close();
  }
  return seenHeaders[0] ?? {};
}

test("local profile (forwardActingHeader: false): a client-supplied acting-as header is DROPPED", async () => {
  const headers = await dispatchWithHeader(makeChannel(false));
  expect(headers["x-houston-acting-as"]).toBeUndefined();
  // The relay itself still worked (the sandbox bearer reached the runtime).
  expect(headers.authorization).toBe("Bearer sbx");
});

test("gateway-fronted profile (forwardActingHeader: true): the minted acting-as header rides through", async () => {
  const headers = await dispatchWithHeader(makeChannel(true));
  expect(headers["x-houston-acting-as"]).toBe("acting-v1.forged-payload.sig");
});

test("routine creator identity (server-minted acting-user) flows regardless of the flag", async () => {
  for (const flag of [false, true]) {
    seenHeaders = [];
    await makeChannel(flag).fireTurn(ctx, "c1", "run it", undefined, "sub-123");
    expect(seenHeaders[0]?.["x-houston-acting-user"]).toBe("sub-123");
    // fireTurn never sends the acting-as header — it is not the routine path.
    expect(seenHeaders[0]?.["x-houston-acting-as"]).toBeUndefined();
  }
});
