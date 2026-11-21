import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";
import {
  agentWorkspace,
  browserAvailable,
  fixtureLaunch,
  fixturePool,
  LOOPBACK_NAME_HOST,
  listen,
  localService,
  MIXED_NAME_HOST,
  SITE_HOST,
  tool,
} from "./browser.test-support";
import { blockedAddress } from "./ip-ranges";

const available = await browserAvailable();

const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find(
    (a) =>
      a?.family === "IPv4" &&
      !a.internal &&
      blockedAddress(a.address, "blocked") === "private_network",
  )?.address;

const local = localService();
const localPort = available ? await listen(local.server) : 0;
const lan = localService();
const lanPort =
  available && lanAddress
    ? await new Promise<number>((resolve) =>
        lan.server.listen(0, lanAddress, () => {
          const address = lan.server.address();
          resolve(typeof address === "object" && address ? address.port : 0);
        }),
      )
    : 0;

const sneaky = () =>
  [
    `http://${LOOPBACK_NAME_HOST}:${localPort}/name`,
    `http://${LOOPBACK_NAME_HOST}.:${localPort}/root-dot`,
    `https://${LOOPBACK_NAME_HOST}:${localPort}/tunnel`,
    `http://${MIXED_NAME_HOST}:${localPort}/mixed`,
    `http://127.0.0.1:${localPort}/literal`,
    `http://localhost:${localPort}/localhost`,
    `http://[::1]:${localPort}/v6`,
  ]
    .map((url) => `<img src="${url}">`)
    .join("") +
  `<script>fetch("http://${LOOPBACK_NAME_HOST}:${localPort}/fetch", { mode: "no-cors" }).catch(() => {});
new WebSocket("ws://${LOOPBACK_NAME_HOST}:${localPort}/ws");</script>`;

const site = createServer((req, res) => {
  if (req.url === "/to-loop") {
    res.writeHead(302, {
      location: `http://${LOOPBACK_NAME_HOST}:${localPort}/redirected`,
    });
    res.end();
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  if (req.url === "/sneaky")
    res.end(`<title>Sneaky</title><h1>Hello</h1>${sneaky()}`);
  else res.end("<title>Fence</title><h1>Public page</h1>");
});
const origin = available ? `http://${SITE_HOST}:${await listen(site)}` : "";

function deployment(managed: boolean): void {
  vi.stubEnv("HOUSTON_MANAGED_CLOUD", managed ? "1" : "");
}

const pools: ReturnType<typeof fixturePool>[] = [];
function managedTool() {
  deployment(true);
  const pool = fixturePool();
  pools.push(pool);
  return tool(agentWorkspace("browser-fence-"), pool);
}

afterEach(async () => {
  await Promise.all(pools.splice(0).map((p) => p.shutdown()));
  vi.unstubAllEnvs();
});

afterAll(() => {
  site.close();
  local.server.close();
  lan.server.close();
});

describe.skipIf(!available)("the network fence in a real Chromium", () => {
  test("a public-looking site loads through the fence; its requests to this machine never land", async () => {
    const run = managedTool();
    const opened = await run({ action: "open", url: `${origin}/sneaky` });
    expect(opened.details).toMatchObject({ ok: true });
    expect(opened.text).toContain("Hello");
    await run({ action: "wait", ms: 1_000 });
    expect(local.hits).toEqual([]);
  });

  test("a redirect to a name that resolves to this machine is refused", async () => {
    const run = managedTool();
    const bounced = await run({ action: "open", url: `${origin}/to-loop` });
    expect(bounced.details).toMatchObject({
      ok: false,
      error: { code: "url_refused" },
    });
    expect(bounced.text).toContain("not on the public web");
    expect(local.hits).toEqual([]);
    const next = await run({ action: "open", url: `${origin}/` });
    expect(next.text).toContain("Public page");
  });

  test("opening a name that resolves to this machine is refused, over http and https", async () => {
    const run = managedTool();
    for (const url of [
      `http://${LOOPBACK_NAME_HOST}:${localPort}/top`,
      `https://${LOOPBACK_NAME_HOST}:${localPort}/top`,
      `http://${MIXED_NAME_HOST}:${localPort}/top`,
    ]) {
      const result = await run({ action: "open", url });
      expect(result.details, url).toMatchObject({
        ok: false,
        error: { code: "url_refused" },
      });
      expect(result.text, url).toContain("not on the public web");
    }
    expect(local.hits).toEqual([]);
  });

  test.skipIf(!lanAddress)(
    "this machine's own LAN address is refused everywhere, private networks allowed or not",
    async () => {
      const url = `http://${lanAddress}:${lanPort}/lan`;
      for (const managed of [true, false]) {
        deployment(managed);
        const browser = await fixtureLaunch();
        const refused = await (await browser.newPage()).goto(url);
        await browser.close();
        expect(refused?.status(), `managed=${managed}`).toBe(403);
      }
      expect(lan.hits).toEqual([]);
    },
  );
});
