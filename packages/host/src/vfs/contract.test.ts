import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runVfsContract } from "../testing/vfs-contract";
import { FsVfs } from "./fs";
import { MemoryVfs } from "./memory";

/**
 * The OPEN Vfs adapters (Memory + Fs) run through the shared contract
 * (../testing/vfs-contract.ts → runVfsContract). The closed GcsVfs, which ran
 * the SAME contract against a real object store, was retired with
 * `@houston/host-cloud` (git history) — the contract stays open as the
 * behavioral bar for any out-of-repo adapter.
 */

runVfsContract("MemoryVfs", () => new MemoryVfs());
runVfsContract(
  "FsVfs",
  () => new FsVfs(mkdtempSync(join(tmpdir(), "houston-vfs-"))),
);
