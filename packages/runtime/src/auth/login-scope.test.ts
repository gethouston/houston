import type { AuthInteraction } from "@earendil-works/pi-ai";
import { expect, test, vi } from "vitest";
import { runWithActingContext } from "../session/acting-context";
import { cancelLogin, getAuthStatus, startLogin } from "./login";
import { modelRuntime } from "./storage";

/**
 * Per-member OAuth logins on a SHARED pod (HOU-976 §2.6). One runtime serves
 * EVERY member of a team space and each request runs inside its own acting
 * identity, so an in-flight login belongs to the acting MEMBER — keying it by
 * provider alone handed member B member A's one-time device code (B would have
 * connected A's provider account) and let B's cancel tear down A's flow.
 */

/** A gateway-shaped acting-as token: the runtime only READS the payload. */
function actingToken(sub: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url");
  return `acting-v1.${payload}.sig`;
}

const alice = { actingAs: actingToken("sub-alice") };
const bob = { actingAs: actingToken("sub-bob") };

/** github-copilot's device-code grant: it binds no port, so both flows coexist. */
const PROVIDER = "github-copilot";

type Flow = { userCode: string; signal: AbortSignal | undefined };

/**
 * Stub pi's OAuth login with a device-code flow that mints a DISTINCT one-time
 * code per call and then polls forever (like a real grant awaiting the user), so
 * a reused login is visible as a repeated code.
 */
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

/** The login row `/auth/status` reports for PROVIDER in the current scope. */
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
    // Bob asks to connect the SAME provider while Alice's flow is in flight.
    const bobInfo = await runWithActingContext(bob, () =>
      startLogin(PROVIDER, true),
    );

    expect(aliceInfo.kind).toBe("device_code");
    expect(bobInfo.kind).toBe("device_code");
    // Bob must NOT receive Alice's one-time code: pasting it would connect
    // ALICE's GitHub account under Bob's credential.
    expect(bobInfo).not.toBe(aliceInfo);
    expect(bobInfo).not.toEqual(aliceInfo);
    // Bob's own login actually ran (two pi flows, two distinct codes).
    expect(pi.oauthLogin).toHaveBeenCalledTimes(2);
    expect(pi.flows.map((f) => f.userCode)).toEqual(["CODE-1", "CODE-2"]);

    // Alice's flow is untouched and still hers.
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

    // Bob dismisses HIS dialog. Alice is still typing her code.
    runWithActingContext(bob, () => cancelLogin(PROVIDER));
    await new Promise((r) => setTimeout(r, 20));

    // Alice's poller was not aborted…
    expect(pi.flows[0]?.signal?.aborted).toBe(false);
    // …only Bob's own.
    expect(pi.flows[1]?.signal?.aborted).toBe(true);
    // …and Alice's login is still live and reachable under her identity.
    expect(await runWithActingContext(alice, loginRow)).toMatchObject({
      status: "awaiting_user",
      info: aliceInfo,
    });
    // Bob's slot is freed, so his retry starts clean.
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
    // Idempotent within one identity: one pi flow, one code (a second flow would
    // strand the first poller and invalidate the code the user is typing).
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
    // Desktop / self-host: no acting identity, exactly as before HOU-976.
    const team = await startLogin(PROVIDER, true);
    expect(await startLogin(PROVIDER, true)).toBe(team);
    expect(await loginRow()).toMatchObject({
      status: "awaiting_user",
      info: team,
    });

    // A member's flow and cancel leave the team's login alone…
    await runWithActingContext(alice, () => startLogin(PROVIDER, true));
    runWithActingContext(alice, () => cancelLogin(PROVIDER));
    await new Promise((r) => setTimeout(r, 20));
    expect(pi.flows[0]?.signal?.aborted).toBe(false);
    expect(await loginRow()).toMatchObject({ status: "awaiting_user" });

    // …and the team's own cancel still frees the team slot.
    cancelLogin(PROVIDER);
    expect(await loginRow()).toBeNull();
  } finally {
    pi.restore();
  }
});
