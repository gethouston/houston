import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWireCapture, json, ORG } from "./support/wire-capture";

const BASE = "https://gw.example";
const { calls, reset, restore, stubFetch } = createWireCapture();
const summary = {
  plan: "free",
  announcement: false,
  plus: {
    status: "none",
    manageable: false,
    price: { amount: 1500, currency: "USD", interval: "month" },
  },
};
const key = { orgSlug: "one", agentSlug: "agent", routineId: "r1" };

beforeEach(reset);
afterEach(() => {
  restore();
  vi.clearAllMocks();
});

function client(): HoustonClient {
  const value = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  value.setActiveOrg(ORG);
  return value;
}

const cases = [
  ["getPlan", "GET", "/v1/me/plan", null, summary],
  ["dismissPlanAnnouncement", "POST", "/v1/me/plan/announcement", null, null],
  [
    "createPlusCheckout",
    "POST",
    "/v1/me/plus/checkout",
    null,
    { url: "https://stripe.test/checkout" },
  ],
  [
    "createPlusPortal",
    "POST",
    "/v1/me/plus/portal",
    null,
    { url: "https://stripe.test/portal" },
  ],
  ["listPlusInvoices", "GET", "/v1/me/plus/invoices", null, { invoices: [] }],
  ["listPlanRoutines", "GET", "/v1/me/routines", null, { routines: [] }],
  ["keepRoutine", "PUT", "/v1/me/routines/keep", JSON.stringify(key), summary],
  ["resumeRoutines", "POST", "/v1/me/routines/resume", null, summary],
  ["reportPresence", "POST", "/v1/me/presence", null, null],
] as const;

describe("personal plan wire", () => {
  for (const [method, verb, path, body, response] of cases) {
    test(`${method} uses ${verb} ${path} with the exact body`, async () => {
      stubFetch(() =>
        response === null
          ? new Response(null, { status: 204 })
          : json(200, response),
      );
      const value = client();
      const result =
        method === "keepRoutine"
          ? await value.keepRoutine(key)
          : await value[method]();
      expect(result).toEqual(response === null ? undefined : response);
      expect(calls).toHaveLength(1);
      const [call] = calls;
      expect(call).toMatchObject({ method: verb, url: `${BASE}${path}`, body });
      expect(call.headers.get("Authorization")).toBe("Bearer t");
      expect(call.headers.get("Content-Type")).toBe("application/json");
      expect(call.headers.get("x-houston-org")).toBeNull();
    });
  }
});
