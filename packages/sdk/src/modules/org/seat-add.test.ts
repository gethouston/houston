import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { OrgCommand } from "./index";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

/** An inert SDK over a mock `fetch` that answers the queued responses in order. */
function makeSdk(...answers: Response[]) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: (init?.method ?? "GET").toUpperCase(),
        url: String(input),
        body: typeof init?.body === "string" ? init.body : null,
      });
      const next = answers.shift();
      if (!next) throw new Error("no answer queued");
      return next;
    },
  );
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(new Map()),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), calls };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const refuse = (status: number, code: string): Response =>
  json({ error: "refused", code }, status);

const CHARGE = {
  kind: "charge",
  amountCents: 7500,
  currency: "usd",
  prorationDate: 1793000000,
  paidSeats: 2,
  seatsInUse: 2,
  renewsAt: "2027-03-26T12:00:00Z",
};
const ADDED = { role: "user", invited: true, email: "ada@x.co" };

describe("quoteSeat", () => {
  it("posts an empty body to /v1/org/members/quote", async () => {
    const { sdk, calls } = makeSdk(json(CHARGE));

    await expect(sdk.org.quoteSeat()).resolves.toEqual(CHARGE);
    expect(calls).toEqual([
      { method: "POST", url: `${BASE}/v1/org/members/quote`, body: "{}" },
    ]);
  });

  it("reads every quote kind, and an unknown one as no charge", async () => {
    const kinds = [
      { kind: "free_seat", paidSeats: 3, seatsInUse: 2 },
      { kind: "billing_owner_only", paidSeats: 2, seatsInUse: 2 },
      { kind: "next_invoice", seatPriceCents: 2000 },
      { kind: "no_charge" },
    ];
    for (const quote of kinds) {
      const { sdk } = makeSdk(json(quote));
      await expect(sdk.org.quoteSeat()).resolves.toEqual(quote);
    }
    const { sdk } = makeSdk(json({ kind: "gift_seat" }));
    await expect(sdk.org.quoteSeat()).resolves.toEqual({ kind: "no_charge" });
  });

  it("throws a failure the quote cannot answer", async () => {
    const { sdk } = makeSdk(json({ error: "boom" }, 500));
    await expect(sdk.org.quoteSeat()).rejects.toMatchObject({ status: 500 });
  });
});

describe("addOrgMember with a seat to pay", () => {
  it("sends the quote's prorationDate with the add", async () => {
    const { sdk, calls } = makeSdk(json(ADDED, 202));

    await expect(
      sdk.org.addOrgMember("ada@x.co", "user", 1793000000),
    ).resolves.toEqual({ kind: "added", member: ADDED });
    expect(calls[0].body).toBe(
      JSON.stringify({
        email: "ada@x.co",
        role: "user",
        prorationDate: 1793000000,
      }),
    );
  });

  it("answers each payment refusal as an outcome", async () => {
    for (const [status, code] of [
      [402, "seat_payment_failed"],
      [402, "seat_payment_needs_action"],
      [403, "billing_owner_only"],
    ] as const) {
      const { sdk, calls } = makeSdk(refuse(status, code));
      await expect(
        sdk.org.addOrgMember("ada@x.co", "user", 1793000000),
      ).resolves.toEqual({ kind: code });
      expect(calls).toHaveLength(1);
    }
  });

  it("re-quotes a stale quote and hands back the new one", async () => {
    for (const code of ["seat_quote_changed", "seat_quote_expired"]) {
      const fresh = { ...CHARGE, amountCents: 9000, prorationDate: 1793000500 };
      const { sdk, calls } = makeSdk(refuse(409, code), json(fresh));
      await expect(
        sdk.org.addOrgMember("ada@x.co", "user", 1793000000),
      ).resolves.toEqual({ kind: "quote_changed", quote: fresh });
      expect(calls.map((c) => c.url)).toEqual([
        `${BASE}/v1/org/members`,
        `${BASE}/v1/org/members/quote`,
      ]);
    }
  });

  it("throws a refusal code under the wrong status, and every other failure", async () => {
    const wrongStatus = makeSdk(refuse(409, "seat_payment_failed"));
    await expect(
      wrongStatus.sdk.org.addOrgMember("ada@x.co", "user"),
    ).rejects.toMatchObject({ status: 409 });
    const taken = makeSdk(refuse(409, "already_member"));
    await expect(
      taken.sdk.org.addOrgMember("ada@x.co", "user"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("dispatches the quote and the add with its prorationDate", async () => {
    const { sdk, calls } = makeSdk(json(CHARGE), json(ADDED, 202));

    await expect(
      sdk.dispatch({ id: "1", type: OrgCommand.QuoteSeat }),
    ).resolves.toEqual({ id: "1", ok: true, value: CHARGE });
    await expect(
      sdk.dispatch({
        id: "2",
        type: OrgCommand.AddMember,
        payload: { email: "ada@x.co", role: "user", prorationDate: 1793000000 },
      }),
    ).resolves.toEqual({
      id: "2",
      ok: true,
      value: { kind: "added", member: ADDED },
    });
    expect(JSON.parse(calls[1].body ?? "{}")).toMatchObject({
      prorationDate: 1793000000,
    });
  });
});
