import { mkdirSync, mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { type AddressInfo, connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { runWithConversationId } from "../../conversation-context";
import type { BrowserParams } from "./actions";
import type { FenceNet } from "./fence-proxy";
import { launchBrowser } from "./launch";
import type { HandoffRegistry } from "./live/registry";
import { BrowserPool, type BrowserPoolOptions } from "./pool";
import { type HandoffBudget, makeBrowserTool } from "./tool";

export const PASSWORD = "Password123";

export function agentWorkspace(prefix = "browser-it-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(dir, ".houston"));
  return dir;
}

export const SITE_HOST = "site.test";
const SITE_ADDRESS = "198.51.100.7";
export const LOOPBACK_NAME_HOST = "loop.test";
export const MIXED_NAME_HOST = "mixed.test";

const FIXTURE_DNS: Record<string, readonly string[]> = {
  [SITE_HOST]: [SITE_ADDRESS],
  [LOOPBACK_NAME_HOST]: ["127.0.0.1"],
  [MIXED_NAME_HOST]: [SITE_ADDRESS, "10.0.0.7"],
};

export const FIXTURE_NET: FenceNet = {
  lookup: async (host) => {
    const answers = FIXTURE_DNS[host];
    if (!answers)
      throw Object.assign(new Error(`no fixture name ${host}`), {
        code: "ENOTFOUND",
      });
    return answers.map((address) => ({ address, family: 4 }));
  },
  connect: (address, port) =>
    connect({ host: address === SITE_ADDRESS ? "127.0.0.1" : address, port }),
};

const LOGIN = `<!doctype html><title>Sign in</title><form method="post" action="/login">
<label>Username <input name="username"></label>
<label>Password <input name="password" type="password"></label>
<button>Sign in</button></form>`;

export function localService(): { server: Server; hits: string[] } {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url ?? "");
    res.end("houston");
  });
  return { server, hits };
}

export function site(local: () => string): Server {
  return createServer((req, res) => {
    const signedIn = /(?:^|; )sid=ok/.test(req.headers.cookie ?? "");
    if (req.url === "/login" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const form = new URLSearchParams(body);
        const ok =
          form.get("username") === "student" &&
          form.get("password") === PASSWORD;
        res.writeHead(302, {
          location: ok ? "/secure" : "/login",
          ...(ok
            ? { "set-cookie": "sid=ok; HttpOnly; Path=/; Max-Age=3600" }
            : {}),
        });
        res.end();
      });
      return;
    }
    if (req.url?.startsWith("/bounce")) {
      res.writeHead(302, { location: `${local()}${req.url}` });
      res.end();
      return;
    }
    if (req.url === "/never") {
      setTimeout(() => res.end(), 60_000).unref();
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    if (req.url === "/stall")
      res.end(
        `<title>Stalled</title><script src="/never"></script><h1>Body</h1>`,
      );
    else if (req.url === "/secure")
      res.end(
        signedIn
          ? "<title>Account</title><h1>Welcome back, student</h1>"
          : "<title>Account</title><h1>Please sign in</h1>",
      );
    else if (req.url === "/popup")
      res.end(`<title>Opener</title><h1>Opener</h1><button>Stay</button>
<button onclick="window.open('/login')">Open sign-in</button>`);
    else if (req.url === "/sneaky")
      res.end(`<title>Sneaky</title><h1>Hello</h1>
<img src="${local()}/img-direct"><img src="/bounce-img">
<script>fetch("${local()}/fetch", { mode: "no-cors", method: "POST", body: "x" })</script>`);
    else res.end(LOGIN);
  });
}

export async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

export const fixtureLaunch = () => launchBrowser(process.env, FIXTURE_NET);

export async function browserAvailable(): Promise<boolean> {
  try {
    await (await fixtureLaunch()).close();
    return true;
  } catch (error) {
    if (process.env.CI) throw error;
    return false;
  }
}

export function fixturePool(options: BrowserPoolOptions = {}): BrowserPool {
  return new BrowserPool({ launch: fixtureLaunch, ...options });
}

export function tool(workspaceDir: string, pool: BrowserPool) {
  return liveTool(workspaceDir, pool);
}

export function handoffTool(
  workspaceDir: string,
  pool: BrowserPool,
  handoffs: HandoffRegistry,
  options: { chat?: string; limitMs?: number; budget?: HandoffBudget } = {},
) {
  const limited = options.limitMs;
  const budget = options.budget ?? (limited ? () => limited : undefined);
  const run = liveTool(workspaceDir, pool, {
    handoffs,
    ...(budget ? { handoffBudget: budget } : {}),
  });
  return (params: BrowserParams, signal?: AbortSignal) =>
    runWithConversationId(options.chat ?? "chat", () => run(params, signal));
}

function liveTool(
  workspaceDir: string,
  pool: BrowserPool,
  live?: { handoffs: HandoffRegistry; handoffBudget?: HandoffBudget },
) {
  const browser = makeBrowserTool({
    workspaceDir,
    pool,
    liveView: live !== undefined,
    ...live,
  });
  return async (params: BrowserParams, signal?: AbortSignal) => {
    const result = await browser.execute(
      "t",
      params,
      signal,
      undefined,
      {} as ExtensionToolContext,
    );
    return {
      text: result.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("\n"),
      details: result.details,
    };
  };
}

export function ref(snapshot: string, role: string, name: string): string {
  const match = new RegExp(`${role} "${name}"[^\\n]*\\[ref=(\\w+)\\]`).exec(
    snapshot,
  );
  if (!match?.[1]) throw new Error(`no ${role} "${name}" in:\n${snapshot}`);
  return match[1];
}
