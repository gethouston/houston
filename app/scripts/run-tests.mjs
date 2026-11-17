// `pnpm test`: every `tests/*.test.ts` in ONE node process, except the files
// tests/own-process.txt lists, which keep a process each. A process per file
// was 80 s locally and 142 s on CI for 719 files, almost all of it booting
// node + tsx again for each; the shared process runs the 614 others in 8 s.
//
// Files run in random order where node supports it (`--test-randomize`, node
// 26; CI's node 22 runs them in a fixed order), so a test that leans on state
// another file left behind fails here rather than when the order changes.
// The seed is printed; HOUSTON_TEST_SEED reruns that order.
//
// With file arguments (`pnpm test tests/foo.test.ts`) those files run the old
// way, a process each.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RUN = ["--import", "tsx", "--experimental-test-module-mocks", "--test"];

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...RUN, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => out.push(chunk));
    child.on("close", (code) => resolve({ code, out: Buffer.concat(out) }));
  });
}

// Exit codes go through `process.exitCode`, never `process.exit()`: stdout to
// a pipe (CI) is asynchronous, and exiting cut the log off at 64 KB, before
// the failures and the summary.
async function main() {
  const given = process.argv.slice(2);
  if (given.length > 0) {
    const { code, out } = await run(given);
    process.stdout.write(out);
    return code ?? 1;
  }

  const ownProcess = readFileSync("tests/own-process.txt", "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const missing = ownProcess.filter((file) => !existsSync(file));
  if (missing.length > 0) {
    console.error(
      `tests/own-process.txt lists files that do not exist; remove them:\n${missing.join("\n")}`,
    );
    return 1;
  }
  const listed = new Set(ownProcess);
  const shared = readdirSync("tests")
    .filter((name) => name.endsWith(".test.ts"))
    .map((name) => join("tests", name))
    .filter((file) => !listed.has(file));

  const order = [];
  if (process.allowedNodeEnvironmentFlags.has("--test-randomize")) {
    const seed =
      process.env.HOUSTON_TEST_SEED ??
      String(Math.floor(Math.random() * 2 ** 31));
    console.log(
      `shared process: random order, seed ${seed} (HOUSTON_TEST_SEED)`,
    );
    order.push("--test-randomize", `--test-random-seed=${seed}`);
  }

  // Concurrent: the shared process holds one core, the per-file run the rest.
  const results = await Promise.all([
    run(["--experimental-test-isolation=none", ...order, ...shared]),
    run(ownProcess),
  ]);
  const runs = [
    [`${shared.length} files in one process`, results[0]],
    [`${ownProcess.length} files in a process each`, results[1]],
  ];
  for (const [name, { out }] of runs) {
    console.log(`\n=== ${name}`);
    process.stdout.write(out);
  }
  for (const [name, { code }] of runs)
    console.log(`${code === 0 ? "passed" : "FAILED"}: ${name}`);
  return results.every(({ code }) => code === 0) ? 0 : 1;
}

process.exitCode = await main();
