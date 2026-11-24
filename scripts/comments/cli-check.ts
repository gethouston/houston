import {
  compareBaseline,
  proseCounts,
  readBaseline,
  scanAll,
} from "./baseline.ts";
import { loadConfig } from "./files.ts";

const plural = (count: number): string =>
  `${count} prose comment${count === 1 ? "" : "s"}`;

const { scans, failures } = scanAll(loadConfig());
const baseline = readBaseline();
const { over, under } = compareBaseline(proseCounts(scans), baseline ?? {});
const lines: string[] = [];
for (const failure of failures) lines.push(`  ${failure}`);
if (baseline === null)
  lines.push("  scripts/comments/baseline.json is missing.");
for (const { file, count, allowed } of over)
  lines.push(`  ${file}: ${plural(count)}, the baseline allows ${allowed}.`);
for (const { file, count, allowed } of under)
  lines.push(
    `  ${file}: ${plural(count)}, the baseline still allows ${allowed}. Run pnpm comments:ratchet to lower it.`,
  );
if (lines.length === 0) {
  console.log(
    `check:comments OK: ${scans.length} files at or under the baseline.`,
  );
} else {
  console.error("check:comments failed.");
  for (const line of lines) console.error(line);
  if (over.length > 0)
    console.error(
      "Code carries no prose comments: a non-obvious decision goes into an ADR in docs/adr/, and an external quirk or invariant may keep a `// WHY: <reason>. ADR-NNNN` line (3 lines at most, an existing ADR or an external URL). Remove the rest with the /delete-comment skill (skills/delete-comment/SKILL.md).",
    );
  process.exitCode = 1;
}
