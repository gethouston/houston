import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fail, parseArgs } from "./args.ts";
import { inScope, loadConfig, readRepoFile, repoRoot } from "./files.ts";
import { planDeletions } from "./plan.ts";

const args = parseArgs(process.argv.slice(2), []);
const [input] = args.positional;
if (!input) fail("usage: pnpm comments:apply <decisions.json>");
const path = resolve(process.env.INIT_CWD ?? process.cwd(), input);
const config = loadConfig();
const plan = planDeletions(JSON.parse(readFileSync(path, "utf8")), {
  inScope: (file) => inScope(file, config),
  read: readRepoFile,
  pinned: config.pinned,
});
if (plan.errors.length > 0)
  fail(["comments:apply wrote nothing:", ...plan.errors].join("\n  "));

const written: string[] = [];
let deleted = 0;
for (const edit of plan.edits) {
  writeFileSync(join(repoRoot, edit.file), edit.after);
  written.push(edit.file);
  deleted += edit.count;
}
const formattable = written.filter((file) =>
  /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file),
);
if (formattable.length > 0)
  execFileSync(
    join(repoRoot, "node_modules/.bin/biome"),
    ["format", "--write", "--no-errors-on-unmatched", ...formattable],
    { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] },
  );
console.log(
  `comments:apply deleted ${deleted} comments in ${written.length} files.`,
);
for (const refusal of plan.refused) console.error(refusal);
if (plan.refused.length > 0) process.exitCode = 1;
