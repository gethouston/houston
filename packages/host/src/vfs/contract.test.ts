import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runVfsContract } from "../testing/vfs-contract";
import { FsVfs } from "./fs";
import { MemoryVfs } from "./memory";
import { PrefixedVfs } from "./prefixed";

runVfsContract("MemoryVfs", () => new MemoryVfs());
runVfsContract(
  "MemoryVfs (case-insensitive disk)",
  () => new MemoryVfs({ keyCase: { fold: "folded", normalize: true } }),
);
runVfsContract(
  "FsVfs",
  () => new FsVfs(mkdtempSync(join(tmpdir(), "houston-vfs-"))),
);
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
