import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CredentialStore, WorkspaceCredential } from "../ports";
import { MemoryCredentialStore } from "./store";
import { FileCredentialStore } from "./file-store";

/**
 * The CredentialStore CONTRACT, run verbatim against every locally-testable
 * adapter — the anti-drift net for the connect-once credential port. The control
 * plane is the SINGLE owner + refresher of each (workspace, provider) token, so
 * every impl must agree on: null-before-put, put→get round-trip, upsert-in-place
 * on refresh, per-(workspace, provider) key isolation, and idempotent remove.
 *
 * The contract treats the stored value as a faithful copy: a `put` followed by a
 * `get` must return every field that was put (a refresh persists access AND
 * refresh tokens, accountId, and expiry — the cloud refresh loop depends on it).
 *
 * NOT CONTRACT-TESTED LOCALLY:
 *   - PgCredentialStore (credentials/store.ts) needs a live Postgres with the
 *     workspace_credentials migration (the ON CONFLICT upsert + bigint expiry).
 *     No fake-Pool unit test exists for it today; running it through THIS suite
 *     is integration territory. Marked with a test.todo below so the gap is
 *     explicit, never silent.
 */
const cred = (
  over: Partial<WorkspaceCredential> = {},
): WorkspaceCredential => ({
  workspaceId: "ws_1",
  provider: "openai-codex",
  accessToken: "at",
  refreshToken: "rt",
  expiresAt: 1_900_000_000_000,
  ...over,
});

function runCredentialStoreContract(
  name: string,
  make: () => CredentialStore,
): void {
  describe(`CredentialStore contract: ${name}`, () => {
    test("get is null before a put", async () => {
      const s = make();
      expect(await s.get("ws_1", "openai-codex")).toBeNull();
    });

    test("put → get round-trips every field", async () => {
      const s = make();
      const c = cred({ accountId: "acct-9", expiresAt: 1_888_000_000_000 });
      await s.put(c);
      const got = await s.get("ws_1", "openai-codex");
      expect(got).toEqual(c);
    });

    test("an api-key credential round-trips with kind and no refresh/expiry", async () => {
      const s = make();
      const apiKey = cred({
        provider: "opencode",
        accessToken: "sk-opencode-zen",
        refreshToken: "",
        expiresAt: 0,
        kind: "api_key" as const,
      });
      await s.put(apiKey);
      expect(await s.get("ws_1", "opencode")).toEqual(apiKey);
    });

    test("put on the same (workspace, provider) overwrites in place (refresh)", async () => {
      const s = make();
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
      const s = make();
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
      const s = make();
      await s.put(cred());
      await s.remove("ws_1", "openai-codex");
      expect(await s.get("ws_1", "openai-codex")).toBeNull();
      // Removing an absent credential is a no-op, not an error.
      await s.remove("ws_1", "openai-codex");
      expect(await s.get("ws_1", "openai-codex")).toBeNull();
    });

    test("remove is scoped to one (workspace, provider) — siblings survive", async () => {
      const s = make();
      await s.put(cred({ workspaceId: "ws_a" }));
      await s.put(cred({ workspaceId: "ws_b", accessToken: "bb" }));
      await s.remove("ws_a", "openai-codex");
      expect(await s.get("ws_a", "openai-codex")).toBeNull();
      expect((await s.get("ws_b", "openai-codex"))?.accessToken).toBe("bb");
    });
  });
}

runCredentialStoreContract(
  "MemoryCredentialStore",
  () => new MemoryCredentialStore(),
);
runCredentialStoreContract(
  "FileCredentialStore",
  () =>
    new FileCredentialStore(
      join(mkdtempSync(join(tmpdir(), "houston-cred-contract-")), "creds.json"),
    ),
);

// PgCredentialStore: behavioral contract needs a live Postgres + the
// workspace_credentials migration (ON CONFLICT upsert, bigint expiry). No
// fake-Pool unit covers it today and it cannot run under `bun test`. This marker
// keeps the missing behavioral coverage explicit.
test.todo("CredentialStore contract: PgCredentialStore (needs a live Postgres — integration pass)", () => {});

// FileCredentialStore-specific behavior beyond the shared contract: a connect
// survives an app restart because the JSON file is the source of truth. Asserted
// here (not in the contract) since MemoryCredentialStore intentionally does NOT
// persist.
test("FileCredentialStore persists across re-open (a login survives a restart)", async () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "houston-cred-persist-")),
    "creds.json",
  );
  const first = new FileCredentialStore(path);
  await first.put(cred({ accountId: "acct-9" }));

  const reopened = new FileCredentialStore(path);
  expect((await reopened.get("ws_1", "openai-codex"))?.accountId).toBe(
    "acct-9",
  );
});
