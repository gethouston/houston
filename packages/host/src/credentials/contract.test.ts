import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  cred,
  runCredentialStoreContract,
} from "../testing/credential-contract";
import { FileCredentialStore } from "./file-store";
import { MemoryCredentialStore } from "./store";

/**
 * The OPEN CredentialStore adapters (Memory + File) run through the shared
 * contract (../testing/credential-contract.ts → runCredentialStoreContract).
 * The closed PgCredentialStore, which ran the SAME contract over pg-mem, was
 * retired with `@houston/host-cloud` (git history) — the contract stays open as
 * the behavioral bar for any out-of-repo adapter.
 */

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
