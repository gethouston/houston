import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEED_AGENT_ID } from "./config";
import { type FakeHost, startFakeHost } from "./server";

/**
 * Covers the package's new lifecycle surface — `startFakeHost` / `FakeHost.stop`
 * — and a few representative routes, so the exported API is exercised outside
 * the Playwright suite. Each test binds an ephemeral port (0) to stay hermetic.
 */
describe("startFakeHost", () => {
  let host: FakeHost;

  beforeEach(async () => {
    host = await startFakeHost(0);
  });

  afterEach(async () => {
    await host.stop();
  });

  it("binds an ephemeral port and reports its url", () => {
    expect(host.port).toBeGreaterThan(0);
    expect(host.url).toBe(`http://localhost:${host.port}`);
  });

  it("answers the health probe", async () => {
    const res = await fetch(`${host.url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: "e2e" });
  });

  it("serves the seeded agent and the local capabilities", async () => {
    const agents = (await (await fetch(`${host.url}/agents`)).json()) as Array<{
      id: string;
    }>;
    expect(agents.map((a) => a.id)).toContain(SEED_AGENT_ID);

    const caps = (await (
      await fetch(`${host.url}/v1/capabilities`)
    ).json()) as { profile: string; providers: string[] };
    expect(caps.profile).toBe("local");
    expect(caps.providers).toContain("anthropic");
  });

  it("serves the pi-ai provider catalog at /v1/catalog", async () => {
    // Regression: the route was missing, so the app's `getCatalog()` 404-degraded
    // to `[]` and the picker/AI-Models tab fell back to the override-only seed
    // (all providers, zero models). It must serve the real `ProviderCatalog` the
    // desktop host would — every runnable provider, each with its models.
    const res = await fetch(`${host.url}/v1/catalog`);
    expect(res.status).toBe(200);
    const catalog = (await res.json()) as Array<{
      id: string;
      auth: string;
      models: Array<{ id: string }>;
    }>;
    // The local profile serves the full pi-ai set — many providers, real models.
    expect(catalog.length).toBeGreaterThan(20);
    const ids = catalog.map((p) => p.id);
    for (const id of ["anthropic", "openai-codex", "openrouter"])
      expect(ids).toContain(id);
    const totalModels = catalog.reduce((n, p) => n + p.models.length, 0);
    expect(totalModels).toBeGreaterThan(100);
  });

  it("exposes the __test__ reset control endpoint", async () => {
    const res = await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("stops cleanly so the port stops accepting connections", async () => {
    const { url } = host;
    await host.stop();
    // Re-start on the same ephemeral port for afterEach's stop() to close.
    host = await startFakeHost(0);
    await expect(fetch(url)).rejects.toThrow();
  });
});
