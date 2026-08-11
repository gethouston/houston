import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, test, vi } from "vitest";
import { RevocationTombstones } from "../credentials/revocation-tombstones";
import type {
  CredentialActing,
  CredentialStore,
  CredentialVault,
} from "../ports";
import { handleSandboxCredentialRevoked } from "./credential-revoked";

/**
 * The revoked-token report is a DELETE trigger for someone else's credential,
 * so what the route passes DOWN is the safety-critical part: the digest that
 * makes the delete conditional, and — for a personal credential — the acting
 * identity that says WHOSE row it is (HOU-976). A personal report without it
 * cannot be actioned at all: the gateway keys those rows by (org, user,
 * provider) and answers 400, leaving the dead token to 401 every turn until it
 * expires (HOU-952).
 */

const vault: CredentialVault = {
  sandboxToken: () => "sbx",
  validateSandboxToken: (t) =>
    t === "sbx" ? { workspaceId: "w1", agentId: "a1" } : null,
};

type Reported = {
  workspaceId: string;
  provider: string;
  accessSha256: string;
  opts?: { scope?: "personal" | "team" } & CredentialActing;
};

function capturingStore(removed = true): {
  credentials: CredentialStore;
  reports: Reported[];
} {
  const reports: Reported[] = [];
  const credentials: CredentialStore = {
    get: async () => null,
    put: async () => {},
    remove: async () => {},
    removeIfAccess: async (workspaceId, provider, accessSha256, opts) => {
      reports.push({ workspaceId, provider, accessSha256, opts });
      return removed;
    },
  };
  return { credentials, reports };
}

function mockReq(body: unknown, token = "sbx"): IncomingMessage {
  const buf = Buffer.from(JSON.stringify(body));
  return {
    headers: { authorization: `Bearer ${token}` },
    async *[Symbol.asyncIterator]() {
      yield buf;
    },
  } as unknown as IncomingMessage;
}

function mockRes(): {
  res: ServerResponse;
  out: { status?: number; body: Record<string, unknown> };
} {
  const out: { status?: number; body: Record<string, unknown> } = { body: {} };
  const res = {
    writeHead(status: number) {
      out.status = status;
    },
    end(buf: Buffer | string) {
      out.body = JSON.parse(buf.toString()) as Record<string, unknown>;
    },
  } as unknown as ServerResponse;
  return { res, out };
}

const post = (
  credentials: CredentialStore,
  body: unknown,
  token = "sbx",
  revocations = new RevocationTombstones(),
) => {
  const { res, out } = mockRes();
  return handleSandboxCredentialRevoked(
    { vault, credentials, revocations },
    "POST",
    "/sandbox/credential/revoked",
    new URL("http://x/sandbox/credential/revoked"),
    mockReq(body, token),
    res,
  ).then((handled) => ({ handled, ...out }));
};

const ACTING = "acting-v1.payload.sig";

test("a personal report forwards the acting identity to the store", async () => {
  const { credentials, reports } = capturingStore();

  const { handled, status, body } = await post(credentials, {
    provider: "anthropic",
    accessSha256: "d".repeat(64),
    scope: "personal",
    actingAs: ACTING,
  });

  expect(handled).toBe(true);
  expect(status).toBe(200);
  expect(body).toEqual({ ok: true, removed: true });
  expect(reports).toEqual([
    {
      workspaceId: "w1",
      provider: "anthropic",
      accessSha256: "d".repeat(64),
      opts: { scope: "personal", actingAs: ACTING },
    },
  ]);
});

test("a team report has no acting identity to forward", async () => {
  const { credentials, reports } = capturingStore(false);

  const { status, body } = await post(credentials, {
    provider: "anthropic",
    accessSha256: "e".repeat(64),
  });

  // `removed:false` is the ordinary superseded case, still a 200.
  expect(status).toBe(200);
  expect(body).toEqual({ ok: true, removed: false });
  expect(reports[0]?.opts).toEqual({ scope: "team", actingAs: undefined });
});

test("a non-string acting identity is dropped, not passed through", async () => {
  const { credentials, reports } = capturingStore();

  await post(credentials, {
    provider: "anthropic",
    accessSha256: "f".repeat(64),
    scope: "personal",
    actingAs: { sub: "nope" },
  });

  expect(reports[0]?.opts?.actingAs).toBeUndefined();
});

test("a report with no token identity is refused, never actioned", async () => {
  const { credentials, reports } = capturingStore();

  const { status } = await post(credentials, {
    provider: "anthropic",
    actingAs: ACTING,
  });

  expect(status).toBe(400);
  expect(reports).toEqual([]);
});

test("an unauthenticated report never reaches the store", async () => {
  const { credentials, reports } = capturingStore();

  const { status } = await post(
    credentials,
    { provider: "anthropic", accessSha256: "a".repeat(64) },
    "forged",
  );

  expect(status).toBe(401);
  expect(reports).toEqual([]);
});

test("a confirmed removal tombstones the credential and logs info, not error (HOUSTON-APP-530)", async () => {
  const { credentials } = capturingStore(true);
  const revocations = new RevocationTombstones();
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    await post(
      credentials,
      { provider: "anthropic", accessSha256: "a".repeat(64) },
      "sbx",
      revocations,
    );

    // The expected disconnect pipeline working is NOT a Sentry error — that
    // error-level line was the whole HOUSTON-APP-530 flood.
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("credential disconnected"),
    );
    expect(
      revocations.active({ workspaceId: "w1", provider: "anthropic" }),
    ).toBe(true);
  } finally {
    errorSpy.mockRestore();
    infoSpy.mockRestore();
  }
});

test("a second confirmed removal inside the window escalates: something refilled a dead credential", async () => {
  const { credentials } = capturingStore(true);
  const revocations = new RevocationTombstones();
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const body = { provider: "anthropic", accessSha256: "a".repeat(64) };
    await post(credentials, body, "sbx", revocations);
    await post(credentials, body, "sbx", revocations);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("refilled and revoked AGAIN"),
    );
  } finally {
    errorSpy.mockRestore();
    infoSpy.mockRestore();
  }
});

test("a superseded report leaves no tombstone — the live credential keeps serving", async () => {
  const { credentials } = capturingStore(false);
  const revocations = new RevocationTombstones();

  await post(
    credentials,
    { provider: "anthropic", accessSha256: "a".repeat(64) },
    "sbx",
    revocations,
  );

  expect(revocations.active({ workspaceId: "w1", provider: "anthropic" })).toBe(
    false,
  );
});
