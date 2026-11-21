import { accessDigest } from "@houston/protocol/access-digest";
import { describe, expect, test } from "vitest";
import type { WorkspaceId } from "../domain/types";
import {
  type CredentialActing,
  type CredentialStore,
  isApiKeyCredential,
  type WorkspaceCredential,
} from "../ports";

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

function actingFor(sub: string): CredentialActing {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url");
  return { actingAs: `acting-v1.${payload}.sig` };
}

const ALICE = actingFor("sub-alice");
const BOB = actingFor("sub-bob");

interface ScopeRun {
  label: string;
  acting: CredentialActing | undefined;
  removeScope: ({ scope: "personal" | "team" } & CredentialActing) | undefined;
}

const SCOPE_RUNS: readonly ScopeRun[] = [
  { label: "team scope", acting: undefined, removeScope: undefined },
  {
    label: "member scope",
    acting: ALICE,
    removeScope: { scope: "personal", ...ALICE },
  },
];

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

function runScopeInvariants(run: ScopeRun, make: () => CredentialStore): void {
  describe(run.label, () => {
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
      expect((await s.get("ws_b", "openai-codex"))?.accessToken).toBe("same");
    });
  });
}

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

    test("a personal revoke report never drops the team's row", async () => {
      const s = make();
      await s.put(cred({ accessToken: "same" }));
      await s.put(cred({ accessToken: "same" }), ALICE);
      await s.removeIfAccess("ws_1", "openai-codex", accessDigest("same"), {
        scope: "personal",
        ...ALICE,
      });
      expect((await s.get("ws_1", "openai-codex"))?.accessToken).toBe("same");
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
