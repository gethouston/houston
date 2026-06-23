import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runVfsContract } from "../testing/vfs-contract";
import { FsVfs } from "./fs";
import { MemoryVfs } from "./memory";

/**
 * The OPEN Vfs adapters (Memory + Fs) run through the shared contract
 * (../testing/vfs-contract.ts → runVfsContract). The CLOSED GcsVfs runs the SAME
 * contract against a real object store (a live GCS bucket or a fake-gcs-server
 * emulator) in `@houston/host-cloud` (vfs/gcs.contract.test.ts), env-gated on
 * HOUSTON_GCS_TEST_BUCKET — the contract function lives on the open side of the
 * seam; only the adapters differ.
 */

runVfsContract("MemoryVfs", () => new MemoryVfs());
runVfsContract(
  "FsVfs",
  () => new FsVfs(mkdtempSync(join(tmpdir(), "houston-vfs-"))),
);
