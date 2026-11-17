import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import { captureWire, type LoginRunner } from "./login-runner";
import { createTurnServer } from "./server";

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});
async function fixture() {
  const runner: LoginRunner = {
    start: vi.fn(async () => ({
      kind: "auth_code" as const,
      url: "https://auth.example/login",
    })),
    status: vi.fn(() => ({ status: "awaiting_user" as const })),
    complete: vi.fn(),
    cancel: vi.fn(),
    credential: vi.fn(() => ({
      kind: "oauth" as const,
      access: "access-fixture",
      refresh: "refresh-fixture",
      expires: 123,
    })),
    apiKey: vi.fn(async () => ({
      kind: "api_key" as const,
      access: "key-fixture",
      refresh: "",
      expires: 0,
    })),
    failure: (_provider, error) => ({
      error: String(error),
      reason: "invalid_key",
    }),
  };
  const begin = vi.fn(async () => {});
  const server = createTurnServer({
    store: new LocalDirStore("/tmp/login-test-store"),
    token: "internal-fixture",
    podUid: "incarnation",
    singleUse: { begin, settled: vi.fn() },
    loginRunner: runner,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (
    path: string,
    body?: unknown,
    token = "internal-fixture",
    uid = "incarnation",
  ) =>
    fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "X-Internal-Token": token,
        "X-Pool-Pod-UID": uid,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { runner, begin, call };
}

test("login endpoints authenticate and bind the incarnation before spending the worker", async () => {
  const { call, begin } = await fixture();
  expect(
    (await call("/login/start", { provider: "anthropic" }, "wrong")).status,
  ).toBe(401);
  expect(
    (
      await call(
        "/login/start",
        { provider: "anthropic" },
        "internal-fixture",
        "wrong",
      )
    ).status,
  ).toBe(409);
  expect(begin).not.toHaveBeenCalled();
});

test("start is idempotent, status and credential keep their wire, complete forwards the code, cancel ends the session", async () => {
  const { call, runner, begin } = await fixture();
  expect(
    await (
      await call("/login/start", {
        provider: "anthropic",
        deviceAuth: false,
        enterpriseDomain: "enterprise.example",
      })
    ).json(),
  ).toEqual({ info: { kind: "auth_code", url: "https://auth.example/login" } });
  expect((await call("/login/start", { provider: "anthropic" })).status).toBe(
    200,
  );
  expect(runner.start).toHaveBeenCalledTimes(1);
  expect(runner.start).toHaveBeenCalledWith(
    "anthropic",
    false,
    "enterprise.example",
  );
  expect(begin).toHaveBeenCalledTimes(1);
  expect(
    (await call("/login/start", { provider: "github-copilot" })).status,
  ).toBe(409);
  expect(await (await call("/login/status?provider=anthropic")).json()).toEqual(
    { status: "awaiting_user" },
  );
  expect(
    await (await call("/login/credential?provider=anthropic")).json(),
  ).toEqual({
    kind: "oauth",
    access: "access-fixture",
    refresh: "refresh-fixture",
    expires: 123,
  });
  expect(
    await (
      await call("/login/complete", {
        provider: "anthropic",
        code: "code-fixture",
      })
    ).json(),
  ).toEqual({ ok: true });
  expect(runner.complete).toHaveBeenCalledWith("anthropic", "code-fixture");
  expect((await call("/turn", {})).status).toBe(503);
  expect((await call("/op", {})).status).toBe(503);
  expect((await call("/health")).status).toBe(503);
  expect(
    await (await call("/login/cancel", { provider: "anthropic" })).json(),
  ).toEqual({ ok: true });
  expect(runner.cancel).toHaveBeenCalledWith("anthropic");
  expect((await call("/login/start", { provider: "anthropic" })).status).toBe(
    409,
  );
});

test("workers that accepted work refuse login", async () => {
  const { call, runner } = await fixture();
  expect((await call("/turn", {})).status).toBe(400);
  expect((await call("/login/start", { provider: "anthropic" })).status).toBe(
    503,
  );
  expect(runner.start).not.toHaveBeenCalled();
});

test("missing login and credential answer 404; failed start and completion answer 400", async () => {
  const { call, runner } = await fixture();
  vi.mocked(runner.status).mockReturnValue(null);
  vi.mocked(runner.credential).mockReturnValue(null);
  expect((await call("/login/status?provider=anthropic")).status).toBe(404);
  expect((await call("/login/credential?provider=anthropic")).status).toBe(404);
  vi.mocked(runner.start).mockRejectedValue(new Error("start refused"));
  expect((await call("/login/start", { provider: "anthropic" })).status).toBe(
    400,
  );
  vi.mocked(runner.complete).mockImplementation(() => {
    throw new Error("no active login");
  });
  expect(
    (await call("/login/complete", { provider: "anthropic", code: "x" }))
      .status,
  ).toBe(400);
});

test("API-key connect returns capture wire and maps typed verification refusal to 502", async () => {
  const { call, runner } = await fixture();
  vi.mocked(runner.apiKey).mockRejectedValue(new Error("invalid key"));
  const failure = await call("/login/api-key", {
    provider: "google",
    apiKey: "key-fixture",
  });
  expect(failure.status).toBe(502);
  expect(await failure.json()).toMatchObject({ reason: "invalid_key" });
  const fresh = await fixture();
  expect(
    await (
      await fresh.call("/login/api-key", {
        provider: "google",
        apiKey: "key-fixture",
      })
    ).json(),
  ).toEqual({
    credential: {
      kind: "api_key",
      access: "key-fixture",
      refresh: "",
      expires: 0,
    },
  });
  expect(
    (await fresh.call("/login/start", { provider: "google" })).status,
  ).toBe(409);
});

test.each(["anthropic", "github-copilot"])(
  "%s OAuth export matches capture including optional account and enterprise domain",
  (provider) => {
    expect(
      captureWire({
        provider,
        access: "access-fixture",
        refresh: "refresh-fixture",
        expires: 123,
        accountId: "account-fixture",
        enterpriseUrl: "enterprise.example",
      }),
    ).toEqual({
      kind: "oauth",
      access: "access-fixture",
      refresh: "refresh-fixture",
      expires: 123,
      accountId: "account-fixture",
      enterpriseUrl: "enterprise.example",
    });
  },
);
test("API-key export carries Azure's endpoint with empty refresh and zero expiry", () => {
  expect(
    captureWire({
      provider: "azure-openai-responses",
      kind: "api_key",
      key: "key-fixture",
      enterpriseUrl: "https://resource.example",
    }),
  ).toEqual({
    kind: "api_key",
    access: "key-fixture",
    refresh: "",
    expires: 0,
    enterpriseUrl: "https://resource.example",
  });
});

test("concurrent login requests wait for the same worker reservation", async () => {
  const { call, begin, runner } = await fixture();
  let release!: () => void;
  begin.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const first = call("/login/start", { provider: "anthropic" });
  await vi.waitFor(() => expect(begin).toHaveBeenCalledTimes(1));
  const second = call("/login/start", { provider: "anthropic" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(runner.start).not.toHaveBeenCalled();
  release();
  expect((await first).status).toBe(200);
  expect((await second).status).toBe(200);
  expect(runner.start).toHaveBeenCalledTimes(1);
});

test("an API-key verification reserves the sole sign-in before it completes", async () => {
  const { call, runner } = await fixture();
  let release!: () => void;
  vi.mocked(runner.apiKey).mockImplementation(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { kind: "api_key", access: "key-fixture", refresh: "", expires: 0 };
  });
  const first = call("/login/api-key", {
    provider: "google",
    apiKey: "key-fixture",
  });
  await vi.waitFor(() => expect(runner.apiKey).toHaveBeenCalledTimes(1));
  expect((await call("/login/start", { provider: "anthropic" })).status).toBe(
    409,
  );
  expect(
    (await call("/login/api-key", { provider: "google", apiKey: "other" }))
      .status,
  ).toBe(409);
  release();
  expect((await first).status).toBe(200);
});
