import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { ProxyChannel } from "../channel/proxy";
import { RevocationTombstones } from "../credentials/revocation-tombstones";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import { FakeLauncher } from "../launcher/fake";
import { forward } from "../proxy/route";
import { MemoryWorkspaceStore } from "../store/memory";
import { type AgentRouteDeps, handleAgents } from "./agents";

/**
 * The HOSTED Claude-subscription push route: `POST
 * /agents/:id/credential/claude-oauth`. Drives handleAgents over real HTTP
 * through the real ProxyChannel + a fake standing runtime, asserting owner authz,
 * strict validation, the central+runtime DUAL WRITE, loud failure on a runtime
 * reject, and that the token is never logged.
 */

const VALID = {
  claudeAiOauth: {
    accessToken: "sk-ant-oat-ACCESS-SECRET",
    refreshToken: "sk-ant-ort-REFRESH-SECRET",
    expiresAt: 1_800_000_000_000,
    scopes: ["user:inference"],
    subscriptionType: "max",
  },
};

// A fake standing runtime capturing the pushed body; `accept` toggles its reply.
let runtime: Server;
let runtimeUrl = "";
let lastPush: unknown = null;
let accept = true;

beforeAll(async () => {
  runtime = createServer((req, res) => {
    if (req.url === "/auth/anthropic/oauth-credential") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        lastPush = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        res.writeHead(accept ? 200 : 500, {
          "Content-Type": "application/json",
        });
        res.end(JSON.stringify(accept ? { ok: true } : { error: "boom" }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => runtime.listen(0, "127.0.0.1", () => r()));
  runtimeUrl = `http://127.0.0.1:${(runtime.address() as AddressInfo).port}`;
});
afterAll(() => runtime.close());

beforeEach(() => {
  lastPush = null;
  accept = true;
});

interface Fixture {
  base: string;
  close: () => void;
  credentials: MemoryCredentialStore;
  workspace: Workspace;
  agent: Agent;
  revocations: RevocationTombstones;
}

/** Boot a host over HTTP whose only principal is `owner`, with one agent. */
async function boot(
  owner = "alice",
  opts: { gatewayFronted?: boolean } = {},
): Promise<Fixture> {
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const credentials = new MemoryCredentialStore();
  // Per-fixture ledger so tests never share the process-wide singleton.
  const revocations = new RevocationTombstones();
  const workspace = await store.getOrCreatePersonalWorkspace(owner);
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "Sales",
  });
  const channel = new ProxyChannel({
    launcher: new FakeLauncher({ baseUrl: runtimeUrl, token: "sbx" }),
    proxy: { forward },
    credentials,
    forwardActingHeader: true,
    revocations,
  });
  const deps: AgentRouteDeps = {
    store,
    channels: { gke: channel },
    ...(opts.gatewayFronted ? { gatewayFronted: true } : {}),
  };

  const s = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    // Single-principal host: the bearer names the acting user.
    const userId = req.headers.authorization?.replace(/^Bearer /, "") || "";
    void handleAgents(
      deps,
      userId,
      req.method || "GET",
      url.pathname,
      url,
      req,
      res,
    )
      .then((handled) => {
        if (!handled) {
          res.writeHead(404);
          res.end();
        }
      })
      .catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
  });
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  return {
    base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`,
    close: () => s.close(),
    credentials,
    workspace,
    agent,
    revocations,
  };
}

function push(
  base: string,
  agentId: string,
  body: unknown,
  user = "alice",
  query = "",
  headers: Record<string, string> = {},
) {
  return fetch(
    `${base}/agents/${encodeURIComponent(agentId)}/credential/claude-oauth${query}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${user}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

describe("POST /agents/:id/credential/claude-oauth", () => {
  test("owner push: 200, central store + runtime dual write", async () => {
    const fx = await boot();
    try {
      const res = await push(fx.base, fx.agent.id, VALID);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      // Central store: an anthropic OAuth credential carrying the refresh token.
      const cred = await fx.credentials.get(fx.workspace.id, "anthropic");
      expect(cred).not.toBeNull();
      expect(cred?.kind).toBe("oauth");
      expect(cred?.accessToken).toBe("sk-ant-oat-ACCESS-SECRET");
      expect(cred?.refreshToken).toBe("sk-ant-ort-REFRESH-SECRET");
      expect(cred?.expiresAt).toBe(1_800_000_000_000);

      // Runtime received the CLI envelope verbatim.
      expect(lastPush).toEqual(VALID);
    } finally {
      fx.close();
    }
  });

  test("attributed connect (acting-as): 200, central store write, runtime NOT touched", async () => {
    // The gateway mints acting-as on EVERY proxied dispatch (cloud #208,
    // personal spaces included). The runtime's HOU-976 scope guard refuses to
    // materialize an attributed credential into the pod-shared claude-login
    // dir — correctly — so the channel must not even try: the central store
    // put IS the connect (served access-only per turn). Treating the refusal
    // as a push failure was the Aug-2026 reconnect loop (HOUSTON-APP-56F):
    // the desktop saw a 502 for a connect that had SUCCEEDED centrally.
    const fx = await boot("alice", { gatewayFronted: true });
    try {
      const res = await push(fx.base, fx.agent.id, VALID, "alice", "", {
        "x-houston-acting-as": "acting-v1.payload.sig",
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      // Central store got the full credential, on the ACTING scope's row (the
      // real gateway maps whose row it is; the memory store keys verbatim)…
      const cred = await fx.credentials.get(fx.workspace.id, "anthropic", {
        actingAs: "acting-v1.payload.sig",
      });
      expect(cred?.accessToken).toBe("sk-ant-oat-ACCESS-SECRET");
      expect(cred?.refreshToken).toBe("sk-ant-ort-REFRESH-SECRET");

      // …and the runtime's materialize endpoint was never called.
      expect(lastPush).toBeNull();
    } finally {
      fx.close();
    }
  });

  test("attributed connect succeeds even when the runtime would reject", async () => {
    // Same arm, runtime broken: the skip means the connect no longer depends
    // on the runtime accepting anything.
    accept = false;
    const fx = await boot("alice", { gatewayFronted: true });
    try {
      const res = await push(fx.base, fx.agent.id, VALID, "alice", "", {
        "x-houston-acting-as": "acting-v1.payload.sig",
      });
      expect(res.status).toBe(200);
      expect(lastPush).toBeNull();
    } finally {
      fx.close();
    }
  });

  test("malformed body → 400, no store write, no runtime push", async () => {
    const fx = await boot();
    try {
      const res = await push(fx.base, fx.agent.id, { nope: true });
      expect(res.status).toBe(400);
      expect(await fx.credentials.get(fx.workspace.id, "anthropic")).toBeNull();
      expect(lastPush).toBeNull();
    } finally {
      fx.close();
    }
  });

  test("invalid JSON body → 400", async () => {
    const fx = await boot();
    try {
      const res = await push(fx.base, fx.agent.id, "{not json");
      expect(res.status).toBe(400);
    } finally {
      fx.close();
    }
  });

  test("non-owner → 403", async () => {
    const fx = await boot();
    try {
      const res = await push(fx.base, fx.agent.id, VALID, "mallory");
      expect(res.status).toBe(403);
    } finally {
      fx.close();
    }
  });

  test("unknown agent → 404", async () => {
    const fx = await boot();
    try {
      const res = await push(fx.base, "agent_ghost", VALID);
      expect(res.status).toBe(404);
    } finally {
      fx.close();
    }
  });

  test("runtime rejects the push → 502 (loud, not a false success)", async () => {
    const fx = await boot();
    accept = false;
    try {
      const res = await push(fx.base, fx.agent.id, VALID);
      expect(res.status).toBe(502);
      // The central store still holds it (durability); the failure surfaces so
      // the desktop can retry / fall back to paste.
      expect(
        await fx.credentials.get(fx.workspace.id, "anthropic"),
      ).not.toBeNull();
    } finally {
      fx.close();
    }
  });

  test("the token never reaches the logs", async () => {
    const fx = await boot();
    const seen: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (m) => {
        const orig = console[m];
        console[m] = (...args: unknown[]) => {
          seen.push(args.map(String).join(" "));
        };
        return () => {
          console[m] = orig;
        };
      },
    );
    try {
      await push(fx.base, fx.agent.id, VALID);
      const blob = seen.join("\n");
      expect(blob).not.toContain("sk-ant-oat-ACCESS-SECRET");
      expect(blob).not.toContain("sk-ant-ort-REFRESH-SECRET");
    } finally {
      for (const restore of spies) restore();
      fx.close();
    }
  });

  // The desktop RECONCILE re-pushes a CACHED snapshot whose refresh token the
  // gateway may have rotated since; clobbering the live central credential
  // with it revokes the whole token family (HOU-855). `?if_absent=1` makes the
  // push fill-only.
  describe("?if_absent=1 (cached-snapshot reconcile)", () => {
    const STALE = {
      claudeAiOauth: {
        accessToken: "sk-ant-oat-STALE-ACCESS",
        refreshToken: "sk-ant-ort-STALE-REFRESH",
        expiresAt: 1_700_000_000_000,
      },
    };

    test("central credential present → 200 no-op: store untouched, runtime NOT materialized", async () => {
      const fx = await boot();
      try {
        // The live (rotated) central credential a fresh login stored earlier.
        await push(fx.base, fx.agent.id, VALID);
        lastPush = null;

        const res = await push(
          fx.base,
          fx.agent.id,
          STALE,
          "alice",
          "?if_absent=1",
        );
        expect(res.status).toBe(200);

        const cred = await fx.credentials.get(fx.workspace.id, "anthropic");
        expect(cred?.refreshToken).toBe("sk-ant-ort-REFRESH-SECRET");
        expect(lastPush).toBeNull();
      } finally {
        fx.close();
      }
    });

    test("no central credential → fills: store + runtime dual write as usual", async () => {
      const fx = await boot();
      try {
        const res = await push(
          fx.base,
          fx.agent.id,
          STALE,
          "alice",
          "?if_absent=1",
        );
        expect(res.status).toBe(200);

        const cred = await fx.credentials.get(fx.workspace.id, "anthropic");
        expect(cred?.refreshToken).toBe("sk-ant-ort-STALE-REFRESH");
        expect(lastPush).toEqual(STALE);
      } finally {
        fx.close();
      }
    });

    test("without the flag a push still overwrites (fresh login)", async () => {
      const fx = await boot();
      try {
        await push(fx.base, fx.agent.id, STALE);
        const res = await push(fx.base, fx.agent.id, VALID);
        expect(res.status).toBe(200);
        const cred = await fx.credentials.get(fx.workspace.id, "anthropic");
        expect(cred?.refreshToken).toBe("sk-ant-ort-REFRESH-SECRET");
      } finally {
        fx.close();
      }
    });

    // HOUSTON-APP-530: the row being ABSENT is not proof it is fillable — a
    // provider-revoked credential was just deleted by the runtime's report,
    // and old pre-HOU-950 clients loop this fill-only push every 15-30s,
    // resurrecting the dead family into another failed turn + revoked report.
    test("after a provider revocation the fill is refused with 409, nothing written", async () => {
      const fx = await boot();
      try {
        fx.revocations.mark({
          workspaceId: fx.workspace.id,
          provider: "anthropic",
          scope: "team",
        });

        const res = await push(
          fx.base,
          fx.agent.id,
          STALE,
          "alice",
          "?if_absent=1",
        );

        expect(res.status).toBe(409);
        expect(
          await fx.credentials.get(fx.workspace.id, "anthropic"),
        ).toBeNull();
        expect(lastPush).toBeNull();
      } finally {
        fx.close();
      }
    });

    // The #1293 attributed early-return SKIPS the materialize hop — the clear
    // must have already happened by then, or every CLOUD reconnect (all of
    // them are attributed) would strand a live tombstone: automatic recovery
    // blocked for a TTL and the "refilled AND revoked AGAIN" escalation primed
    // to fire on the fresh credential. Two different acting tokens carry the
    // same sub, proving the tombstone keys off the USER, not the token.
    test("an ATTRIBUTED overwrite clears personal+team tombstones without materializing", async () => {
      // base64url({"sub":"alice-sub"})
      const payload = "eyJzdWIiOiJhbGljZS1zdWIifQ";
      const fx = await boot("alice", { gatewayFronted: true });
      try {
        fx.revocations.mark({
          workspaceId: fx.workspace.id,
          provider: "anthropic",
          scope: "personal",
          actingAs: `acting-v1.${payload}.sig-of-report`,
        });
        fx.revocations.mark({
          workspaceId: fx.workspace.id,
          provider: "anthropic",
          scope: "team",
        });

        const res = await push(fx.base, fx.agent.id, VALID, "alice", "", {
          "x-houston-acting-as": `acting-v1.${payload}.sig-of-connect`,
        });
        expect(res.status).toBe(200);

        // Cleared for the member AND the shared key…
        expect(
          fx.revocations.active({
            workspaceId: fx.workspace.id,
            provider: "anthropic",
            actingAs: `acting-v1.${payload}.sig-of-a-later-turn`,
          }),
        ).toBe(false);
        expect(
          fx.revocations.active({
            workspaceId: fx.workspace.id,
            provider: "anthropic",
          }),
        ).toBe(false);

        // …and the attributed connect still never touched the runtime.
        expect(lastPush).toBeNull();
      } finally {
        fx.close();
      }
    });

    test("a fresh overwrite push clears the tombstone; fills work again after", async () => {
      const fx = await boot();
      try {
        fx.revocations.mark({
          workspaceId: fx.workspace.id,
          provider: "anthropic",
          scope: "team",
        });

        // The user signs in again for real: never blocked, and it lifts the
        // tombstone so automatic serving/fills resume.
        const fresh = await push(fx.base, fx.agent.id, VALID);
        expect(fresh.status).toBe(200);
        expect(
          fx.revocations.active({
            workspaceId: fx.workspace.id,
            provider: "anthropic",
          }),
        ).toBe(false);

        // With the row cleared (e.g. sign-out), a fill-only push works again.
        await fx.credentials.remove(fx.workspace.id, "anthropic");
        const refill = await push(
          fx.base,
          fx.agent.id,
          STALE,
          "alice",
          "?if_absent=1",
        );
        expect(refill.status).toBe(200);
      } finally {
        fx.close();
      }
    });
  });
});
