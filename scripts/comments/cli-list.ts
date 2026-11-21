import { fail, parseArgs } from "./args.ts";
import { scanAll } from "./baseline.ts";
import { loadConfig, readRepoFile } from "./files.ts";
import type { Comment } from "./model.ts";

const args = parseArgs(process.argv.slice(2), ["context"]);
const contextFlag = args.flags.get("context");
const context = contextFlag === undefined ? 4 : Number(contextFlag);
if (!Number.isInteger(context) || context < 0)
  fail("--context takes a whole number of lines");

interface Entry {
  file: string;
  lines: string[];
  prose: Comment[];
}

const { scans, failures } = scanAll(loadConfig(), args.positional);
const entries: Entry[] = scans
  .map(({ file, comments }) => ({
    file,
    lines: readRepoFile(file).split("\n"),
    prose: comments.filter((comment) => !comment.tooling),
  }))
  .filter((entry) => entry.prose.length > 0)
  .sort(
    (a, b) => b.lines.length - a.lines.length || (a.file < b.file ? -1 : 1),
  );

function window(
  entry: Entry,
  comment: Comment,
): { start: number; lines: string[] } {
  const start = Math.max(1, comment.line - context);
  const end = Math.min(entry.lines.length, comment.endLine + context);
  return { start, lines: entry.lines.slice(start - 1, end) };
}

if (args.flags.has("json")) {
  const rows = entries.flatMap((entry) =>
    entry.prose.map((comment) => ({
      id: comment.id,
      file: entry.file,
      fileLines: entry.lines.length,
      line: comment.line,
      col: comment.col,
      endLine: comment.endLine,
      kind: comment.kind,
      text: comment.text,
      context: window(entry, comment),
    })),
  );
  console.log(JSON.stringify(rows, null, 2));
} else {
  for (const entry of entries) {
    console.log(
      `== ${entry.file} (${entry.lines.length} lines, ${entry.prose.length} prose comments)`,
    );
    for (const comment of entry.prose) {
      console.log(
        `-- ${comment.id} (${comment.kind}, lines ${comment.line}-${comment.endLine})`,
      );
      const { start, lines } = window(entry, comment);
      const width = String(start + lines.length).length;
      lines.forEach((line, index) => {
        const number = start + index;
        const mark =
          number >= comment.line && number <= comment.endLine ? ">" : " ";
        console.log(`${mark} ${String(number).padStart(width)} | ${line}`);
      });
    }
  }
  const total = entries.reduce((sum, entry) => sum + entry.prose.length, 0);
  console.log(`${total} prose comments in ${entries.length} files.`);
}
for (const failure of failures) console.error(failure);
if (failures.length > 0) process.exitCode = 1;
