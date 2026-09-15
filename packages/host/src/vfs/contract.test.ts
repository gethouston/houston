import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runVfsContract } from "../testing/vfs-contract";
import { FsVfs } from "./fs";
import { MemoryVfs } from "./memory";
import { PrefixedVfs } from "./prefixed";

/**
 * The OPEN Vfs adapters (Memory + Fs + Prefixed) run through the shared
 * contract (../testing/vfs-contract.ts → runVfsContract). The closed GcsVfs,
 * which ran the SAME contract against a real object store, was retired with
 * `@houston/host-cloud` (git history) — the contract stays open as the
 * behavioral bar for any out-of-repo adapter.
 */

runVfsContract("MemoryVfs", () => new MemoryVfs());
// The `folded` MemoryVfs is the stand-in for a macOS/Windows disk on ANY CI
// volume, so it has to clear the same bar as the adapters it imitates.
runVfsContract(
  "MemoryVfs (case-insensitive disk)",
  () => new MemoryVfs({ keyCase: { fold: "folded", normalize: true } }),
);
runVfsContract(
  "FsVfs",
  () => new FsVfs(mkdtempSync(join(tmpdir(), "houston-vfs-"))),
);
// The adapter the cloud op path runs every workspace file through
// (`runtime/src/turn/op-route.ts`): re-rooting must not weaken a single
// guarantee, least of all the move refusal.
runVfsContract(
  "PrefixedVfs over MemoryVfs",
  () => new PrefixedVfs(new MemoryVfs(), "workspaces"),
);
runVfsContract(
  "PrefixedVfs over FsVfs",
  () =>
    new PrefixedVfs(
      new FsVfs(mkdtempSync(join(tmpdir(), "houston-vfs-prefixed-"))),
      "workspaces",
    ),
);
