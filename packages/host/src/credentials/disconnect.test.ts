import { expect, test } from "vitest";
import type { CredentialStore, WorkspaceCredential } from "../ports";
import { disconnectRejectedCredential } from "./disconnect";
import { RemoteCredentialDeadError } from "./remote-store";
import { RevocationTombstones } from "./revocation-tombstones";

/**
 * Compare-and-delete: the token endpoint's rejection condemns exactly ONE
 * credential, and the store can move on while the endpoint is still answering.
 * The re-read decides whether the rejection still applies — and it must never
 * hand the CONDEMNED credential back as a supersession.
 */

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
  // The rejected-refresh drop is as terminal as a provider revocation: an
  // if_absent snapshot push / fallback adoption / heal that refills the row
  // would loop invalid_grant → disconnect forever (HOU-855, HOUSTON-APP-530).
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
  // RemoteCredentialStore answers `get` from a 15s cache, so the read that
  // follows a failed compare-and-delete can return the VERY credential the
  // endpoint rejected. Serving it as a supersession keeps a dead token alive
  // and loops the same rejection on every turn.
  expect(await disconnect(store({ get: async () => ({ ...rejected }) }))).toBe(
    null,
  );
});

test("a failing re-read reads as absent, not as a 500 escaping the route", async () => {
  // This runs inside the serve route's catch. A gateway blip here would escape
  // as an unhandled 500 instead of the marked 404 the runtime knows how to act
  // on.
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
