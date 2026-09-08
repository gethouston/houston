import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleStoreFenceGate,
  isFencedWrite,
  resetStoreFenceReport,
  STORE_FENCED_ERROR,
} from "./store-fence-gate";

type FakeResponse = ServerResponse & {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

function fakeResponse(): FakeResponse {
  const res = {
    status: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    headersSent: false,
    writeHead(status: number, headers: Record<string, string>) {
      res.status = status;
      res.headers = headers;
      res.headersSent = true;
      return res;
    },
    end(buf?: Buffer) {
      if (buf) res.body = JSON.parse(buf.toString("utf8"));
    },
  };
  return res as unknown as FakeResponse;
}

describe("isFencedWrite", () => {
  it("gates user-facing agent-data mutations and nothing else", () => {
    expect(isFencedWrite("PATCH", "/agents/a/routines/r1", "agents")).toBe(
      true,
    );
    expect(isFencedWrite("POST", "/agents/a/activities", "agents")).toBe(true);
    expect(isFencedWrite("DELETE", "/agents/a/routines/r1", "agents")).toBe(
      true,
    );
    expect(isFencedWrite("GET", "/agents/a/routines", "agents")).toBe(false);
    expect(isFencedWrite("POST", "/feedback", "agents")).toBe(false);
  });

  it("gates the runtime's routine/learning/mission/skill saves only", () => {
    expect(isFencedWrite("POST", "/sandbox/routines", "sandbox")).toBe(true);
    expect(isFencedWrite("PATCH", "/sandbox/routines/r1", "sandbox")).toBe(
      true,
    );
    expect(isFencedWrite("POST", "/sandbox/learnings", "sandbox")).toBe(true);
    expect(isFencedWrite("POST", "/sandbox/missions/start", "sandbox")).toBe(
      true,
    );
    expect(isFencedWrite("POST", "/sandbox/skills/install", "sandbox")).toBe(
      true,
    );
    // The credential serve and the integration proxy never touch the tree.
    expect(isFencedWrite("POST", "/sandbox/credential", "sandbox")).toBe(false);
    expect(
      isFencedWrite("POST", "/sandbox/integrations/execute", "sandbox"),
    ).toBe(false);
    // The user-facing prefix is not this scope's job (it is gated post-auth).
    expect(isFencedWrite("PATCH", "/agents/a/routines/r1", "sandbox")).toBe(
      false,
    );
  });
});

describe("handleStoreFenceGate", () => {
  afterEach(() => {
    resetStoreFenceReport();
    vi.restoreAllMocks();
  });

  it("passes every request through while the fence is held or absent", () => {
    const res = fakeResponse();
    expect(
      handleStoreFenceGate({}, "PATCH", "/agents/a/routines/r1", res, "agents"),
    ).toBe(false);
    expect(
      handleStoreFenceGate(
        { storeFenced: () => false },
        "PATCH",
        "/agents/a/routines/r1",
        res,
        "agents",
      ),
    ).toBe(false);
    expect(res.headersSent).toBe(false);
  });

  it("refuses a write with a distinct 503 once the fence is lost, and reports once", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = { storeFenced: () => true };
    const first = fakeResponse();
    expect(
      handleStoreFenceGate(
        deps,
        "PATCH",
        "/agents/a/routines/r1",
        first,
        "agents",
      ),
    ).toBe(true);
    expect(first.status).toBe(503);
    expect(first.body).toEqual({
      error: STORE_FENCED_ERROR,
      code: "store_fenced",
    });
    // Not the gateway's waking shape: no Retry-After, so the client surfaces
    // it as a real failure instead of a quiet wake.
    expect(first.headers["Retry-After"]).toBeUndefined();

    const second = fakeResponse();
    expect(
      handleStoreFenceGate(
        deps,
        "POST",
        "/sandbox/routines",
        second,
        "sandbox",
      ),
    ).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain("write fence was lost");

    // Reads are untouched: the pod's copy is still the freshest answer.
    const read = fakeResponse();
    expect(
      handleStoreFenceGate(deps, "GET", "/agents/a/routines", read, "agents"),
    ).toBe(false);
  });

  it("names the state in the body so the toast and Sentry carry it", () => {
    expect(STORE_FENCED_ERROR).toContain("newer engine");
  });
});
