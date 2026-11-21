import { fail, parseArgs } from "./args.ts";
import {
  proseCounts,
  ratchetBaseline,
  readBaseline,
  scanAll,
  sortedCounts,
  writeBaseline,
} from "./baseline.ts";
import { loadConfig } from "./files.ts";

const args = parseArgs(process.argv.slice(2), []);
if (
  args.flags.has("init") &&
  readBaseline() !== null &&
  !args.flags.has("force")
)
  fail(
    "scripts/comments/baseline.json already exists. pnpm comments:ratchet lowers it; pnpm comments:ratchet --init --force rebuilds it from the current tree.",
  );
const { scans, failures } = scanAll(loadConfig());
if (failures.length > 0) fail(failures.join("\n"));
const current = proseCounts(scans);
const total = (counts: Record<string, number>): number =>
  Object.values(counts).reduce((sum, count) => sum + count, 0);

if (args.flags.has("init")) {
  const next = sortedCounts(current);
  writeBaseline(next);
  console.log(
    `Wrote scripts/comments/baseline.json: ${total(next)} prose comments in ${Object.keys(next).length} files.`,
  );
} else {
  const baseline = readBaseline();
  if (baseline === null)
    fail(
      "scripts/comments/baseline.json is missing. Run pnpm comments:ratchet --init once to create it.",
    );
  const { next, raised } = ratchetBaseline(current, baseline);
  if (raised.length > 0) {
    console.error("comments:ratchet refuses to raise the baseline:");
    for (const { file, count, allowed } of raised)
      console.error(
        allowed === 0
          ? `  ${file}: ${count} prose comments in a file the baseline does not allow any`
          : `  ${file}: ${count} prose comments, the baseline allows ${allowed}`,
      );
    fail(
      "Delete the new comments with the /delete-comment skill (skills/delete-comment/SKILL.md).",
    );
  }
  writeBaseline(next);
  console.log(
    `Lowered scripts/comments/baseline.json from ${total(baseline)} to ${total(next)} prose comments.`,
  );
}
