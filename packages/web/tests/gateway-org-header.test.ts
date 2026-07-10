import { afterEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import type { ControlPlaneConfig } from "../src/engine-adapter/control-plane";
import { exportPreview } from "../src/engine-adapter/portable";

// C8 §Active space: with a team space pinned, EVERY gateway call must carry
// `x-houston-org: <slug>`, else the gateway resolves the caller's PERSONAL org
// and a team agent's routes 404/403. These guard the two standalone cp fetch
// helpers (cpFilesFetch, portable hostFetch) that the E3 threading missed.

const BASE = "https://gateway.example";
const ORG = "abcdef0123456789";

function captureFetch(): { headerFor: () => string | null } {
  let lastOrg: string | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      lastOrg = headers.get("x-houston-org");
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return { headerFor: () => lastOrg };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("cpFilesFetch sends x-houston-org for the active team space", async () => {
  const cap = captureFetch();
  const client = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  client.setActiveOrg(ORG);
  await client.listProjectFiles("agent-1");
  expect(cap.headerFor()).toBe(ORG);
});

test("portable exportPreview sends x-houston-org for the active team space", async () => {
  const cap = captureFetch();
  const cfg: ControlPlaneConfig = {
    baseUrl: BASE,
    token: "t",
    activeOrgSlug: ORG,
  };
  await exportPreview(cfg, "agent-1");
  expect(cap.headerFor()).toBe(ORG);
});
