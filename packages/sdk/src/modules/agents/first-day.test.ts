import { afterEach, describe, expect, it, vi } from "vitest";
import type { SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { AgentsCommand } from "./index";

/**
 * The first-day lifecycle as the SDK owns it: a new hire is born pending in
 * its own create (its config rides the seeds), and the start is ONE request
 * whose answer every surface reads the same way.
 */

const BASE = "http://127.0.0.1:4317";

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function harness(answer: { status: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({
        method: init?.method ?? "GET",
        path: url.pathname,
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: { "content-type": "application/json" },
      });
    },
  );
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(),
    devicePreferences: memoryKv(),
    clock: {
      now: () => 0,
      setTimeout: () => 0,
      clearTimeout: () => undefined,
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const sdk = new HoustonSdk({ baseUrl: BASE, ports, reactivity: false });
  return { sdk, calls };
}

const STARTED = {
  outcome: "started",
  mission: { id: "m1", sessionKey: "activity-m1", title: "Getting set up" },
  role: "Financial analyst",
  arrival: "created",
};

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
});

describe("a new hire's create carries its pending first day", () => {
  it("folds the initial config into the seeds as the config document", async () => {
    const h = harness({
      status: 201,
      body: { id: "a1", name: "Nova", workspaceId: "w", createdAt: 1 },
    });
    dispose = h.sdk.agents.dispose;
    await h.sdk.agents.writes.create({
      name: "Nova",
      seeds: { "a.txt": "x" },
      config: {
        provider: "openai",
        model: "gpt-5",
        firstDay: "pending",
        arrival: "created",
      },
    });
    const body = h.calls[0]?.body as { seeds: Record<string, string> };
    expect(Object.keys(body)).toEqual(["name", "seeds"]);
    expect(body.seeds["a.txt"]).toBe("x");
    expect(JSON.parse(body.seeds[".houston/config/config.json"] ?? "")).toEqual(
      {
        provider: "openai-codex",
        model: "gpt-5",
        firstDay: "pending",
        arrival: "created",
      },
    );
  });
});

describe("startFirstDay", () => {
  it("is one POST to the agent's first-day route, answered as the host said", async () => {
    const h = harness({ status: 201, body: STARTED });
    dispose = h.sdk.agents.dispose;
    const result = await h.sdk.agents.startFirstDay("Home/Ada", {
      locale: "es",
      title: "Primeros pasos",
    });
    expect(h.calls).toEqual([
      {
        method: "POST",
        path: "/agents/Home%2FAda/first-day",
        body: { locale: "es", title: "Primeros pasos" },
      },
    ]);
    expect(result).toEqual(STARTED);
  });

  it.each([
    "first_day_not_pending",
    "first_day_not_started",
  ])("the %s refusal throws once with the host's 409, never retried", async (code) => {
    const h = harness({ status: 409, body: { error: "refused", code } });
    dispose = h.sdk.agents.dispose;
    const err = await h.sdk.agents.startFirstDay("a1").catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "AgentsHttpError", status: 409 });
    expect((err as Error).message).toContain(code);
    expect(h.calls).toHaveLength(1);
  });

  it("the command path shape-checks its untrusted input", async () => {
    const h = harness({ status: 201, body: STARTED });
    dispose = h.sdk.agents.dispose;
    const bad = await h.sdk.dispatch({
      id: "bad",
      type: AgentsCommand.StartFirstDay,
      payload: { agentId: "a1", input: { locale: 7 } },
    });
    expect(bad.ok).toBe(false);
    expect(h.calls).toHaveLength(0);
    const good = await h.sdk.dispatch({
      id: "good",
      type: AgentsCommand.StartFirstDay,
      payload: { agentId: "a1" },
    });
    expect(good).toMatchObject({ ok: true, value: STARTED });
    expect(h.calls[0]?.body).toEqual({});
  });
});
