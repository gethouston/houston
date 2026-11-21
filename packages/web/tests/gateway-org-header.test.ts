import { HoustonClient } from "@houston/engine-adapter/client";
import type { ControlPlaneConfig } from "@houston/engine-adapter/control-plane";
import { exportPreview } from "@houston/engine-adapter/portable";
import { afterEach, expect, test, vi } from "vitest";

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

function teamClient(): HoustonClient {
  const client = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  client.setActiveOrg(ORG);
  return client;
}

test("a free org's routines and presence carry x-houston-org", async () => {
  const cap = captureFetch();
  const client = teamClient();
  await client.listPlanRoutines();
  expect(cap.headerFor()).toBe(ORG);
  await client.reportPresence();
  expect(cap.headerFor()).toBe(ORG);
});

test("the per-person plan stays account-wide, with no x-houston-org", async () => {
  const cap = captureFetch();
  await teamClient().getPlan();
  expect(cap.headerFor()).toBeNull();
});
