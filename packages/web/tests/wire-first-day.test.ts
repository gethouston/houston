import { HoustonClient } from "@houston/engine-adapter/client";
import {
  firstDayRefusal,
  isFirstDayNoProvider,
  isFirstDayProviderUnavailable,
} from "@houston/sdk";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * An AI Employee's FIRST DAY as it crosses the wire, delegated to
 * `@houston/sdk`'s agents module.
 *
 * - A new hire's config (its brain and its pending first day) rides the
 *   create itself, as the config document in `seeds`: no second write, so it
 *   can neither fail after the hire nor race a later one.
 * - The start is ONE `POST /agents/:id/first-day`. The host makes it
 *   idempotent, which is why the SDK re-issues it on a waking answer
 *   (`agents/first-day.ts`): a start pressed while a new hire's pod is still
 *   coming up waits it out, and a repeat can only hand back the same task.
 */

const BASE = "http://host";
const CONFIG = ".houston/config/config.json";

const { calls, reset, restore, stubResponses } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const client = () => {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
};

const STARTED = {
  outcome: "started",
  mission: { id: "m1", sessionKey: "activity-m1", title: "Primeros pasos" },
  role: "Financial analyst",
  arrival: "created",
};

test("a hire's initial config rides the create as its config document", async () => {
  stubResponses(
    json(201, { id: "a1", workspaceId: "w", name: "Ada", createdAt: 0 }),
  );

  await client().createAgent("w", {
    name: "Ada",
    configId: "blank",
    claudeMd: "# hi",
    config: {
      provider: "openai",
      model: "gpt-5",
      firstDay: "pending",
      arrival: "created",
    },
  });

  expect(calls).toHaveLength(1);
  const [post] = calls;
  expect(post.method).toBe("POST");
  expect(post.url).toBe(`${BASE}/agents`);
  expectGatewayHeaders(post);
  expect(post.body).toBe(
    JSON.stringify({
      name: "Ada",
      claudeMd: "# hi",
      seeds: {
        [CONFIG]: `${JSON.stringify(
          {
            provider: "openai-codex",
            model: "gpt-5",
            firstDay: "pending",
            arrival: "created",
          },
          null,
          2,
        )}\n`,
      },
    }),
  );
});

test("startFirstDay is one byte-identical POST /agents/:id/first-day", async () => {
  stubResponses(json(201, STARTED));

  const result = await client().startFirstDay("Home/Ada", {
    locale: "es",
    title: "Primeros pasos",
  });

  expect(calls).toHaveLength(1);
  const [post] = calls;
  expect(post.method).toBe("POST");
  expect(post.url).toBe(`${BASE}/agents/Home%2FAda/first-day`);
  expect(post.body).toBe(
    JSON.stringify({ locale: "es", title: "Primeros pasos" }),
  );
  expectGatewayHeaders(post);
  expect(result).toEqual(STARTED);
});

test("a start pressed while the pod wakes waits it out on the same request", async () => {
  vi.useFakeTimers();
  const waking = { error: "engine unavailable", detail: "agent is waking" };
  stubResponses(json(503, waking), json(201, STARTED));

  const pending = client().startFirstDay("a1", {});
  await vi.advanceTimersByTimeAsync(60_000);

  expect(await pending).toEqual(STARTED);
  expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
    ["POST", `${BASE}/agents/a1/first-day`, "{}"],
    ["POST", `${BASE}/agents/a1/first-day`, "{}"],
  ]);
});

test.each([
  "first_day_not_pending",
  "first_day_not_started",
  "first_day_no_provider",
  "first_day_provider_unavailable",
])("the %s refusal surfaces as the adapter's engine error, never retried", async (code) => {
  vi.useFakeTimers();
  stubResponses(json(409, { error: "refused", code }));
  const pending = client()
    .startFirstDay("a1", {})
    .catch((err: unknown) => err);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(await pending).toMatchObject({
    name: "HoustonEngineError",
    status: 409,
  });
  expect(calls).toHaveLength(1);
});

test("a start with no AI connected (409 first_day_no_provider) is the typed refusal", async () => {
  stubResponses(
    json(409, {
      error: "No provider connected for anthropic. Connect it first.",
      code: "first_day_no_provider",
      provider: "anthropic",
    }),
  );
  const failure = await client()
    .startFirstDay("a1", {})
    .then(
      () => null,
      (err: unknown) => err,
    );
  expect(failure).toMatchObject({ name: "HoustonEngineError", status: 409 });
  // The SDK names it: an expected state the surface turns into its connect
  // prompt, never a report. The provider it names rides along.
  expect(isFirstDayNoProvider(failure)).toBe(true);
  expect(firstDayRefusal(failure)).toEqual({
    code: "first_day_no_provider",
    error: "No provider connected for anthropic. Connect it first.",
    provider: "anthropic",
  });
  expect(calls).toHaveLength(1);
  // Any other refused start stays an ordinary failure.
  stubResponses(json(409, { error: "refused", code: "first_day_not_started" }));
  const other = await client()
    .startFirstDay("a1", {})
    .then(
      () => null,
      (err: unknown) => err,
    );
  expect(isFirstDayNoProvider(other)).toBe(false);
});

test("a start whose AI could not be reached (409 first_day_provider_unavailable + Retry-After) is the typed refusal, not re-issued", async () => {
  vi.useFakeTimers();
  stubResponses(
    new Response(
      JSON.stringify({
        error: "the AI provider could not be reached; try again in a minute",
        code: "first_day_provider_unavailable",
      }),
      {
        status: 409,
        headers: { "content-type": "application/json", "retry-after": "60" },
      },
    ),
  );
  const pending = client()
    .startFirstDay("a1", {})
    .then(
      () => null,
      (err: unknown) => err,
    );
  await vi.advanceTimersByTimeAsync(120_000);
  const failure = await pending;
  expect(failure).toMatchObject({ name: "HoustonEngineError", status: 409 });
  expect(isFirstDayProviderUnavailable(failure)).toBe(true);
  expect(isFirstDayNoProvider(failure)).toBe(false);
  expect(calls).toHaveLength(1);
});
