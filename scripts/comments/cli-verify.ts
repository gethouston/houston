import { fail, parseArgs } from "./args.ts";
import { git, inScope, loadConfig, readRepoFile } from "./files.ts";
import { verifyFile } from "./verify.ts";

const args = parseArgs(process.argv.slice(2), ["base", "allow"]);
const baseFlag = args.flags.get("base");
const base = typeof baseFlag === "string" ? baseFlag : "origin/main";
const config = loadConfig();
const pathspec = ["--", ...args.positional];
const allowed = new Set(
  args.values("allow").map((file) => file.replace(/^\.\//, "")),
);
const allowedSeen: string[] = [];

let mergeBase = "";
try {
  mergeBase = git(["merge-base", base, "HEAD"]).trim();
} catch {
  fail(`comments:verify: cannot find a merge base between ${base} and HEAD`);
}

const status = git([
  "diff",
  "-z",
  "--name-status",
  "--no-renames",
  mergeBase,
  ...pathspec,
])
  .split("\0")
  .filter(Boolean);
const added = git([
  "ls-files",
  "-z",
  "--others",
  "--exclude-standard",
  ...pathspec,
])
  .split("\0")
  .filter(Boolean);
const deleted: string[] = [];
const skipped: string[] = [];
const problems: string[] = [];
let verified = 0;

for (let i = 0; i + 1 < status.length; i += 2) {
  const [code, file] = [status[i], status[i + 1]];
  if (code === "A") added.push(file);
  else if (code === "D") deleted.push(file);
  else if (!inScope(file, config)) skipped.push(file);
  else {
    try {
      const allowCode = allowed.has(file);
      if (allowCode) allowedSeen.push(file);
      problems.push(
        ...verifyFile(
          file,
          git(["show", `${mergeBase}:${file}`]),
          readRepoFile(file),
          { pinned: config.pinned, allowCode },
        ),
      );
      verified++;
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
}

const section = (title: string, files: readonly string[]): void => {
  if (files.length === 0) return;
  console.log(`${title}:`);
  for (const file of [...files].sort()) console.log(`  ${file}`);
};
section("New files, not compared", added);
section("Deleted files, not compared", deleted);
section("Changed files the comment tools do not read", skipped);
section(
  "Code edits allowed by --allow, tooling comments still compared",
  allowedSeen,
);
section(
  "--allow names a file that is not a changed file the comment tools read",
  [...allowed].filter((file) => !allowedSeen.includes(file)),
);
for (const problem of problems) console.error(problem);
console.log(
  `comments:verify: ${verified} changed files compared against ${base} (${mergeBase.slice(0, 12)}), ${problems.length} problems.`,
);
if (problems.length > 0) process.exitCode = 1;
