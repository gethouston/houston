/**
 * Smoke test for the embeddable bundle: build the IIFE with esbuild, then
 * evaluate it in a BARE Node `vm` context injected with ONLY the documented
 * host polyfills (timers + console — see BRIDGE.md "Host polyfills"). No
 * `fetch`, `Headers`, `AbortController`, `TextEncoder`/`TextDecoder`, or
 * `crypto` are provided: if the bundle needed a hidden global it would throw
 * here. It then round-trips one real command through the built code.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { build } from "esbuild";
import { beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

let bundle = "";
beforeAll(async () => {
  const result = await build({
    entryPoints: [join(here, "..", "src", "bridge", "entry.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "HoustonSdkBridge",
    platform: "browser",
    target: "es2022",
  });
  bundle = result.outputFiles[0].text;
});

/** The ONLY globals a compliant host must polyfill (BRIDGE.md normative list). */
function documentedPolyfills(): Record<string, unknown> {
  const keep = (t: ReturnType<typeof setTimeout>) => {
    (t as { unref?: () => void }).unref?.();
    return t;
  };
  return {
    setTimeout: (fn: () => void, ms?: number) => keep(setTimeout(fn, ms)),
    clearTimeout: (id: unknown) =>
      clearTimeout(id as ReturnType<typeof setTimeout>),
    setInterval: (fn: () => void, ms?: number) => keep(setInterval(fn, ms)),
    clearInterval: (id: unknown) =>
      clearInterval(id as ReturnType<typeof setInterval>),
    console,
  };
}

interface BridgeGlobal {
  version: number;
  create(opts: { send: (m: string) => void }): {
    receive(m: string): void;
    dispose(): void;
  };
}

describe("embeddable bundle in a bare vm", () => {
  it("exposes one global with a version and self-provides all shims", () => {
    const context = createContext(documentedPolyfills());
    runInContext(bundle, context);
    const g = (context as { HoustonSdkBridge: BridgeGlobal }).HoustonSdkBridge;
    expect(typeof g).toBe("object");
    expect(g.version).toBe(1);
    expect(typeof g.create).toBe("function");
  });

  it("installs a working URLSearchParams when the engine lacks it", () => {
    // The bare vm context omits URLSearchParams (JavaScriptCore parity); the
    // bundle must self-shim it so runtime-client's providers/login path works.
    const context = createContext(documentedPolyfills());
    expect(
      (context as { URLSearchParams?: unknown }).URLSearchParams,
    ).toBeUndefined();
    runInContext(bundle, context);
    const ctor = (
      context as { URLSearchParams: new (init?: unknown) => unknown }
    ).URLSearchParams;
    expect(typeof ctor).toBe("function");
    const serialized = runInContext(
      "const p = new URLSearchParams(); p.set('deviceAuth', 'false'); p.set('enterpriseDomain', 'acme.ghe.com'); p.toString();",
      context,
    );
    expect(serialized).toBe("deviceAuth=false&enterpriseDomain=acme.ghe.com");
  });

  it("round-trips a command with only the documented polyfills present", async () => {
    const context = createContext(documentedPolyfills());
    runInContext(bundle, context);
    const g = (context as { HoustonSdkBridge: BridgeGlobal }).HoustonSdkBridge;

    const outbound: { kind: string; [k: string]: unknown }[] = [];
    const store = new Map<string, string>();
    const bridge = g.create({
      send: (message: string) => {
        const msg = JSON.parse(message);
        outbound.push(msg);
        // Play a minimal native host: serve storage, refuse the events fetch.
        queueMicrotask(() => {
          if (msg.kind === "storage/get")
            bridge.receive(
              JSON.stringify({
                kind: "storage/result",
                id: msg.id,
                value: store.get(msg.key) ?? null,
              }),
            );
          else if (msg.kind === "storage/set") {
            store.set(msg.key, msg.value);
            bridge.receive(
              JSON.stringify({ kind: "storage/result", id: msg.id }),
            );
          } else if (msg.kind === "storage/delete") {
            store.delete(msg.key);
            bridge.receive(
              JSON.stringify({ kind: "storage/result", id: msg.id }),
            );
          } else if (msg.kind === "fetch/start")
            bridge.receive(
              JSON.stringify({
                kind: "fetch/error",
                id: msg.id,
                message: "offline",
              }),
            );
        });
      },
    });

    const waitFor = (
      pred: (m: { kind: string; [k: string]: unknown }) => boolean,
    ) =>
      new Promise<{ kind: string; [k: string]: unknown }>((resolve) => {
        const tick = () => {
          const hit = outbound.find(pred);
          if (hit) resolve(hit);
          else setTimeout(tick, 5);
        };
        tick();
      });

    bridge.receive(
      JSON.stringify({ kind: "configure", baseUrl: "http://127.0.0.1:9" }),
    );
    await waitFor((m) => m.kind === "ready");

    bridge.receive(
      JSON.stringify({
        kind: "command",
        envelope: {
          id: "smoke-1",
          type: "session/setToken",
          payload: { token: "tok-123" },
        },
      }),
    );
    const result = (await waitFor(
      (m) =>
        m.kind === "result" &&
        (m as { result: { id: string } }).result.id === "smoke-1",
    )) as { result: { id: string; ok: boolean } };

    expect(result.result).toEqual({ id: "smoke-1", ok: true });
    expect(store.get("houston.sdk.session.token")).toBe("tok-123");
    bridge.dispose();
  });
});
