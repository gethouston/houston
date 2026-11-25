import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkAdr } from "./adr-refs.ts";
import { workingTreeRepo } from "./adr-repo.ts";
import { loadConfig, repoRoot } from "./files.ts";

const retired = new Set(loadConfig().retiredPaths.map((entry) => entry.path));
const repo = workingTreeRepo(repoRoot, retired);

const adrDir = join(repoRoot, "docs/adr");
let count = 0;
for (const name of readdirSync(adrDir).sort()) {
  if (!name.endsWith(".md")) continue;
  const problems = checkAdr(readFileSync(join(adrDir, name), "utf8"), repo);
  for (const { line, message } of problems)
    console.error(`docs/adr/${name}:${line}: ${message}`);
  count += problems.length;
}
if (count > 0) {
  console.error(
    `check:adr-refs failed: ${count} stale file or symbol references. Point each at the current file and symbol.`,
  );
  process.exitCode = 1;
} else console.log("check:adr-refs OK.");
