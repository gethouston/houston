import { expect, test } from "vitest";
import type { CredentialStore, WorkspaceCredential } from "../ports";
import { disconnectRejectedCredential } from "./disconnect";
import { RemoteCredentialDeadError } from "./remote-store";
import { RevocationTombstones } from "./revocation-tombstones";

const rejected: WorkspaceCredential = {
  workspaceId: "w1",
  provider: "openai-codex",
  accessToken: "AT-dead",
  refreshToken: "rt.dead",
  expiresAt: 1,
};

function store(over: Partial<CredentialStore> = {}): CredentialStore {
  return {
    get: async () => null,
    put: async () => {},
    remove: async () => {},
    removeIfAccess: async () => false,
    ...over,
  };
}

const disconnect = (
  credentials: CredentialStore,
  revocations = new RevocationTombstones(),
) =>
  disconnectRejectedCredential({
    credentials,
    workspaceId: "w1",
    rejected,
    reason: "invalid_grant",
    revocations,
  });

test("a matching credential is dropped and the caller told it is gone", async () => {
  const removals: string[] = [];
  const result = await disconnect(
    store({
      removeIfAccess: async (_w, _p, accessSha256) => {
        removals.push(accessSha256);
        return true;
      },
      get: async () => {
        throw new Error("must not re-read after a successful delete");
      },
    }),
  );
  expect(result).toBeNull();
  expect(removals).toHaveLength(1);
});

test("a dropped credential leaves a tombstone so automatic refills stay refused", async () => {
  const revocations = new RevocationTombstones();
  await disconnect(store({ removeIfAccess: async () => true }), revocations);
  expect(
    revocations.active({ workspaceId: "w1", provider: "openai-codex" }),
  ).toBe(true);
});

test("a superseded rejection leaves no tombstone — the live credential keeps serving", async () => {
  const revocations = new RevocationTombstones();
  await disconnect(store({ removeIfAccess: async () => false }), revocations);
  expect(
    revocations.active({ workspaceId: "w1", provider: "openai-codex" }),
  ).toBe(false);
});

test("a genuinely superseding credential is handed back to be served", async () => {
  const superseding: WorkspaceCredential = {
    ...rejected,
    accessToken: "AT-reconnected",
    refreshToken: "rt.fresh",
    expiresAt: Date.now() + 3_600_000,
  };
  expect(await disconnect(store({ get: async () => superseding }))).toBe(
    superseding,
  );
});

test("the re-read never resurrects the credential that was just rejected", async () => {
  expect(await disconnect(store({ get: async () => ({ ...rejected }) }))).toBe(
    null,
  );
});

test("a failing re-read reads as absent, not as a 500 escaping the route", async () => {
  expect(
    await disconnect(
      store({
        get: async () => {
          throw new RemoteCredentialDeadError("gateway said the row is dead");
        },
      }),
    ),
  ).toBeNull();
});
