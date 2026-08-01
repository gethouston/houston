import { accessDigest } from "@houston/protocol/access-digest";
import { describe, expect, test } from "vitest";
import type { WorkspaceId } from "../domain/types";
import {
  type CredentialActing,
  type CredentialStore,
  isApiKeyCredential,
  type WorkspaceCredential,
} from "../ports";

/**
 * The CredentialStore CONTRACT, run verbatim against every adapter — the
 * anti-drift net for the connect-once credential port. The control plane is the
 * SINGLE owner + refresher of each (workspace, provider) token, so every impl
 * must agree on: null-before-put, put→get round-trip, upsert-in-place on
 * refresh, per-(workspace, provider) key isolation, and idempotent remove.
 *
 * Exported from `@houston/host` (OPEN) and run by the open adapter suite
 * (credentials/contract.test.ts: Memory/File). The closed PgCredentialStore
 * suite that also consumed it was retired with `@houston/host-cloud` (git
 * history); the contract stays exported as the behavioral bar for any
 * out-of-repo adapter.
 *
 * SCOPE (HOU-976). Every method takes an optional acting identity, because one
 * pod serves every member of a team space: a member's credential is a DIFFERENT
 * row from the team's. So the whole suite runs TWICE — once with no acting
 * identity (the team scope: desktop, self-host, and every pre-HOU-976 caller,
 * whose calls are byte-identical to what they always were) and once as a member.
 * `describe("cross-scope isolation")` then pins what only two scopes together can
 * show: a member's credential is never visible to, nor removable by, the team or
 * another member. Without those, an adapter that silently DROPS the acting
 * identity passes every invariant while serving one member's account to another.
 *
 * The contract treats the stored value as a faithful copy: a `put` followed by a
 * `get` must return every field that was put (a refresh persists access AND
 * refresh tokens, accountId, and expiry — the cloud refresh loop depends on it).
 *
 * The ONE field the contract normalizes is the optional `kind`: it is never
 * load-bearing on a fetched credential — every consumer (re-)derives api_key vs
 * oauth from `isApiKeyCredential` (the expiresAt=0 sentinel), so an adapter may
 * store-and-return it absent (Memory/File preserve the put shape) or synthesize
 * the explicit value (Pg derives `kind` in `get`). `expectRoundTrip` pins that
 * documented equivalence — every other field must match exactly.
 */
export const cred = (
  over: Partial<WorkspaceCredential> = {},
): WorkspaceCredential => ({
  workspaceId: "ws_1",
  provider: "openai-codex",
  accessToken: "at",
  refreshToken: "rt",
  expiresAt: 1_900_000_000_000,
  ...over,
});

/**
 * Round-trip equality up to the documented `kind` normalization: every field
 * must match exactly, and the api_key-ness (the only semantics consumers read)
 * must agree, regardless of whether the adapter returned `kind` absent or
 * explicit.
 */
export function expectRoundTrip(
  got: WorkspaceCredential | null,
  put: WorkspaceCredential,
): void {
  expect(got).not.toBeNull();
  if (!got) return;
  const { kind: _g, ...gotRest } = got;
  const { kind: _p, ...putRest } = put;
  expect(gotRest).toEqual(putRest);
  expect(isApiKeyCredential(got)).toBe(isApiKeyCredential(put));
}

/**
 * A member's acting-as token, minted the way the gateway mints it
 * (`acting-v1.<base64url payload>.sig`) so an adapter that partitions by
 * identity can read the payload's `sub` exactly as it does in production (see
 * credentials/remote-store.ts).
 */
function actingFor(sub: string): CredentialActing {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url");
  return { actingAs: `acting-v1.${payload}.sig` };
}

const ALICE = actingFor("sub-alice");
const BOB = actingFor("sub-bob");

/** One pass of the contract: WHOSE credentials every call in it addresses. */
interface ScopeRun {
  label: string;
  /** The acting identity carried by every call; undefined = the team scope. */
  acting: CredentialActing | undefined;
  /**
   * `removeIfAccess`'s opts for this pass. Carries the acting identity as well
   * as `scope`: the digest says WHICH token was reported, but only the identity
   * says whose row holds it, and a compare-and-delete that cannot name the row
   * would have to scan every member's (MAJOR 7 / MINOR 16).
   */
  removeScope: ({ scope: "personal" | "team" } & CredentialActing) | undefined;
}

const SCOPE_RUNS: readonly ScopeRun[] = [
  // The team pass must stay byte-identical to the pre-HOU-976 suite: no acting
  // identity, no opts — the exact calls desktop and self-host make.
  { label: "team scope", acting: undefined, removeScope: undefined },
  {
    label: "member scope",
    acting: ALICE,
    removeScope: { scope: "personal", ...ALICE },
  },
];

/** The store's four operations, pre-bound to one scope run. */
function opsFor(store: CredentialStore, run: ScopeRun) {
  return {
    get: (workspaceId: WorkspaceId, provider: string) =>
      store.get(workspaceId, provider, run.acting),
    put: (c: WorkspaceCredential) => store.put(c, run.acting),
    remove: (workspaceId: WorkspaceId, provider: string) =>
      store.remove(workspaceId, provider, run.acting),
    removeIfAccess: (
      workspaceId: WorkspaceId,
      provider: string,
      accessSha256: string,
    ) =>
      store.removeIfAccess(
        workspaceId,
        provider,
        accessSha256,
        run.removeScope,
      ),
  };
}

export function runCredentialStoreContract(
  name: string,
  make: () => CredentialStore,
): void {
  describe(`CredentialStore contract: ${name}`, () => {
    for (const run of SCOPE_RUNS) runScopeInvariants(run, make);
    runCrossScopeInvariants(make);
  });
}

/**
 * Every single-scope invariant, asserted identically for the team and for a
 * member — the same credential lifecycle has to hold whichever row it lives in.
 */
function runScopeInvariants(run: ScopeRun, make: () => CredentialStore): void {
  describe(run.label, () => {
    /** A fresh store with this run's scope bound to it. */
    const fresh = () => opsFor(make(), run);

    test("get is null before a put", async () => {
      const s = fresh();
      expect(await s.get("ws_1", "openai-codex")).toBeNull();
    });

    test("put → get round-trips every field", async () => {
      const s = fresh();
      const c = cred({ accountId: "acct-9", expiresAt: 1_888_000_000_000 });
      await s.put(c);
      expectRoundTrip(await s.get("ws_1", "openai-codex"), c);
    });

    test("an api-key credential round-trips with kind and no refresh/expiry", async () => {
      const s = fresh();
      const apiKey = cred({
        provider: "opencode",
        accessToken: "sk-opencode-zen",
        refreshToken: "",
        expiresAt: 0,
        kind: "api_key" as const,
      });
      await s.put(apiKey);
      expectRoundTrip(await s.get("ws_1", "opencode"), apiKey);
    });

    test("put on the same (workspace, provider) overwrites in place (refresh)", async () => {
      const s = fresh();
      await s.put(cred());
      await s.put(
        cred({
          accessToken: "at2",
          refreshToken: "rt2",
          expiresAt: 1_950_000_000_000,
        }),
      );
      const got = await s.get("ws_1", "openai-codex");
      expect(got?.accessToken).toBe("at2");
      expect(got?.refreshToken).toBe("rt2");
      expect(got?.expiresAt).toBe(1_950_000_000_000);
    });

    test("workspaces and providers are isolated keys", async () => {
      const s = fresh();
      await s.put(cred({ workspaceId: "ws_a" }));
      await s.put(cred({ workspaceId: "ws_b", accessToken: "bb" }));
      await s.put(
        cred({ workspaceId: "ws_a", provider: "anthropic", accessToken: "an" }),
      );

      expect((await s.get("ws_a", "openai-codex"))?.accessToken).toBe("at");
      expect((await s.get("ws_b", "openai-codex"))?.accessToken).toBe("bb");
      expect((await s.get("ws_a", "anthropic"))?.accessToken).toBe("an");
      expect(await s.get("ws_b", "anthropic")).toBeNull();
    });

    test("remove deletes the credential and is idempotent", async () => {
      const s = fresh();
      await s.put(cred());
      await s.remove("ws_1", "openai-codex");
      expect(await s.get("ws_1", "openai-codex")).toBeNull();
      // Removing an absent credential is a no-op, not an error.
      await s.remove("ws_1", "openai-codex");
      expect(await s.get("ws_1", "openai-codex")).toBeNull();
    });

    test("remove is scoped to one (workspace, provider) — siblings survive", async () => {
      const s = fresh();
      await s.put(cred({ workspaceId: "ws_a" }));
      await s.put(cred({ workspaceId: "ws_b", accessToken: "bb" }));
      await s.remove("ws_a", "openai-codex");
      expect(await s.get("ws_a", "openai-codex")).toBeNull();
      expect((await s.get("ws_b", "openai-codex"))?.accessToken).toBe("bb");
    });

    // HOU-952: a runtime reporting a provider-REVOKED token. Every adapter has
    // to compare before deleting, or the report becomes a new way to sign a
    // workspace out.
    test("removeIfAccess drops the reported token", async () => {
      const s = fresh();
      await s.put(cred({ accessToken: "revoked-tok" }));
      expect(
        await s.removeIfAccess(
          "ws_1",
          "openai-codex",
          accessDigest("revoked-tok"),
        ),
      ).toBe(true);
      expect(await s.get("ws_1", "openai-codex")).toBeNull();
    });

    test("removeIfAccess spares a credential that moved on", async () => {
      // The reporting turn began BEFORE the user reconnected. Deleting here
      // would destroy the credential they just created.
      const s = fresh();
      await s.put(cred({ accessToken: "freshly-reconnected" }));
      expect(
        await s.removeIfAccess("ws_1", "openai-codex", accessDigest("old-tok")),
      ).toBe(false);
      expect((await s.get("ws_1", "openai-codex"))?.accessToken).toBe(
        "freshly-reconnected",
      );
    });

    test("removeIfAccess on an absent credential is false, not an error", async () => {
      const s = fresh();
      expect(
        await s.removeIfAccess("ws_1", "openai-codex", accessDigest("any")),
      ).toBe(false);
    });

    test("removeIfAccess is scoped to one (workspace, provider)", async () => {
      const s = fresh();
      await s.put(cred({ workspaceId: "ws_a", accessToken: "same" }));
      await s.put(cred({ workspaceId: "ws_b", accessToken: "same" }));
      await s.removeIfAccess("ws_a", "openai-codex", accessDigest("same"));
      expect(await s.get("ws_a", "openai-codex")).toBeNull();
      // An identical token in ANOTHER workspace is a different credential.
      expect((await s.get("ws_b", "openai-codex"))?.accessToken).toBe("same");
    });
  });
}

/**
 * What only two scopes together can prove (HOU-976): the acting identity is part
 * of the key, not decoration. A store that accepts `acting` and ignores it
 * satisfies every invariant above while serving one member's subscription to
 * another member — and, worse, letting either delete the other's connection.
 */
function runCrossScopeInvariants(make: () => CredentialStore): void {
  describe("cross-scope isolation", () => {
    test("a member's put is invisible to the team, and the team's to the member", async () => {
      const s = make();
      await s.put(cred({ accessToken: "alice-tok" }), ALICE);
      expect(await s.get("ws_1", "openai-codex")).toBeNull();

      const t = make();
      await t.put(cred({ accessToken: "team-tok" }));
      expect(await t.get("ws_1", "openai-codex", ALICE)).toBeNull();
    });

    test("two members are isolated from each other", async () => {
      const s = make();
      await s.put(cred({ accessToken: "alice-tok" }), ALICE);
      await s.put(cred({ accessToken: "bob-tok" }), BOB);
      expect((await s.get("ws_1", "openai-codex", ALICE))?.accessToken).toBe(
        "alice-tok",
      );
      expect((await s.get("ws_1", "openai-codex", BOB))?.accessToken).toBe(
        "bob-tok",
      );
      // Neither member's connect ever became the team's.
      expect(await s.get("ws_1", "openai-codex")).toBeNull();
    });

    test("a member's remove leaves the team credential connected", async () => {
      const s = make();
      await s.put(cred({ accessToken: "team-tok" }));
      await s.put(cred({ accessToken: "alice-tok" }), ALICE);
      await s.remove("ws_1", "openai-codex", ALICE);
      expect(await s.get("ws_1", "openai-codex", ALICE)).toBeNull();
      expect((await s.get("ws_1", "openai-codex"))?.accessToken).toBe(
        "team-tok",
      );
    });

    test("the team's remove leaves a member's credential connected", async () => {
      const s = make();
      await s.put(cred({ accessToken: "team-tok" }));
      await s.put(cred({ accessToken: "alice-tok" }), ALICE);
      await s.remove("ws_1", "openai-codex");
      expect(await s.get("ws_1", "openai-codex")).toBeNull();
      expect((await s.get("ws_1", "openai-codex", ALICE))?.accessToken).toBe(
        "alice-tok",
      );
    });

    // The revoke report (HOU-952) crosses scopes too: the gateway can serve the
    // TEAM's token to a member's turn, so a report names WHICH scope's row it
    // saw. Both rows can legitimately hold the same token — the scope is what
    // decides, and dropping the wrong one signs somebody else out.
    test("a personal revoke report never drops the team's row", async () => {
      const s = make();
      await s.put(cred({ accessToken: "same" }));
      await s.put(cred({ accessToken: "same" }), ALICE);
      await s.removeIfAccess("ws_1", "openai-codex", accessDigest("same"), {
        scope: "personal",
        ...ALICE,
      });
      expect((await s.get("ws_1", "openai-codex"))?.accessToken).toBe("same");
      // The reporter's OWN row is the one that went.
      expect(await s.get("ws_1", "openai-codex", ALICE)).toBeNull();
    });

    test("a team revoke report never drops a member's row", async () => {
      const s = make();
      await s.put(cred({ accessToken: "same" }));
      await s.put(cred({ accessToken: "same" }), ALICE);
      expect(
        await s.removeIfAccess("ws_1", "openai-codex", accessDigest("same"), {
          scope: "team",
        }),
      ).toBe(true);
      expect(await s.get("ws_1", "openai-codex")).toBeNull();
      expect((await s.get("ws_1", "openai-codex", ALICE))?.accessToken).toBe(
        "same",
      );
    });
  });
}
