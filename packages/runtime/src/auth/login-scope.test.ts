import type { AuthInteraction } from "@earendil-works/pi-ai";
import { expect, test, vi } from "vitest";
import { runWithActingContext } from "../session/acting-context";
import { cancelLogin, getAuthStatus, startLogin } from "./login";
import { modelRuntime } from "./storage";

function actingToken(sub: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url");
  return `acting-v1.${payload}.sig`;
}

const alice = { actingAs: actingToken("sub-alice") };
const bob = { actingAs: actingToken("sub-bob") };

const PROVIDER = "github-copilot";

type Flow = { userCode: string; signal: AbortSignal | undefined };

function stubDeviceCodeLogin() {
  const flows: Flow[] = [];
  const oauthLogin = vi.fn((interaction: AuthInteraction) => {
    const userCode = `CODE-${flows.length + 1}`;
    flows.push({ userCode, signal: interaction.signal });
    interaction.notify({
      type: "device_code",
      userCode,
      verificationUri: "https://github.com/login/device",
    });
    return new Promise<never>(() => {});
  });
  const spy = vi.spyOn(modelRuntime, "getProvider").mockImplementation(
    (id: string) =>
      ({
        id,
        name: id,
        auth: { oauth: { name: id, login: oauthLogin } },
      }) as never,
  );
  return { flows, oauthLogin, restore: () => spy.mockRestore() };
}

async function loginRow() {
  return (await getAuthStatus()).providers.find((p) => p.provider === PROVIDER)
    ?.login;
}

test("a member's in-flight login is never handed to another member (cross-scope device code)", async () => {
  const pi = stubDeviceCodeLogin();
  try {
    const aliceInfo = await runWithActingContext(alice, () =>
      startLogin(PROVIDER, true),
    );
    const bobInfo = await runWithActingContext(bob, () =>
      startLogin(PROVIDER, true),
    );

    expect(aliceInfo.kind).toBe("device_code");
    expect(bobInfo.kind).toBe("device_code");
    expect(bobInfo).not.toBe(aliceInfo);
    expect(bobInfo).not.toEqual(aliceInfo);
    expect(pi.oauthLogin).toHaveBeenCalledTimes(2);
    expect(pi.flows.map((f) => f.userCode)).toEqual(["CODE-1", "CODE-2"]);

    expect(await runWithActingContext(alice, loginRow)).toMatchObject({
      status: "awaiting_user",
      info: aliceInfo,
    });
    expect(await runWithActingContext(bob, loginRow)).toMatchObject({
      status: "awaiting_user",
      info: bobInfo,
    });
  } finally {
    runWithActingContext(alice, () => cancelLogin(PROVIDER));
    runWithActingContext(bob, () => cancelLogin(PROVIDER));
    pi.restore();
  }
});

test("a member's cancel never tears down another member's in-flight login", async () => {
  const pi = stubDeviceCodeLogin();
  try {
    const aliceInfo = await runWithActingContext(alice, () =>
      startLogin(PROVIDER, true),
    );
    await runWithActingContext(bob, () => startLogin(PROVIDER, true));

    runWithActingContext(bob, () => cancelLogin(PROVIDER));
    await new Promise((r) => setTimeout(r, 20));

    expect(pi.flows[0]?.signal?.aborted).toBe(false);
    expect(pi.flows[1]?.signal?.aborted).toBe(true);
    expect(await runWithActingContext(alice, loginRow)).toMatchObject({
      status: "awaiting_user",
      info: aliceInfo,
    });
    expect(await runWithActingContext(bob, loginRow)).toBeNull();
  } finally {
    runWithActingContext(alice, () => cancelLogin(PROVIDER));
    pi.restore();
  }
});

test("same member, same provider: a second connect click reuses the live login", async () => {
  const pi = stubDeviceCodeLogin();
  try {
    const first = await runWithActingContext(alice, () =>
      startLogin(PROVIDER, true),
    );
    const again = await runWithActingContext(alice, () =>
      startLogin(PROVIDER, true),
    );
    expect(again).toBe(first);
    expect(pi.oauthLogin).toHaveBeenCalledTimes(1);
  } finally {
    runWithActingContext(alice, () => cancelLogin(PROVIDER));
    pi.restore();
  }
});

test("no acting identity: the team scope keeps its own slot, untouched by members", async () => {
  const pi = stubDeviceCodeLogin();
  try {
    const team = await startLogin(PROVIDER, true);
    expect(await startLogin(PROVIDER, true)).toBe(team);
    expect(await loginRow()).toMatchObject({
      status: "awaiting_user",
      info: team,
    });

    await runWithActingContext(alice, () => startLogin(PROVIDER, true));
    runWithActingContext(alice, () => cancelLogin(PROVIDER));
    await new Promise((r) => setTimeout(r, 20));
    expect(pi.flows[0]?.signal?.aborted).toBe(false);
    expect(await loginRow()).toMatchObject({ status: "awaiting_user" });

    cancelLogin(PROVIDER);
    expect(await loginRow()).toBeNull();
  } finally {
    pi.restore();
  }
});
