import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RUN = ["--import", "tsx", "--experimental-test-module-mocks", "--test"];

function run(args, shared = false) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        ...(shared
          ? [
              "--import",
              "tsx",
              fileURLToPath(new URL("./run-shared-tests.mjs", import.meta.url)),
            ]
          : RUN),
        ...args,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    child.on("error", (error) => {
      console.error(error);
      resolve({ code: 1 });
    });
    child.on("close", (code) => resolve({ code }));
  });
}

async function main() {
  const given = process.argv.slice(2);
  if (given.length > 0) {
    const { code } = await run(given);
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

  const seed = process.env.HOUSTON_TEST_SEED ?? randomBytes(4).readUInt32LE();
  let state = Number(seed);
  if (!Number.isInteger(state) || state < 0 || state > 0xffffffff) {
    console.error("HOUSTON_TEST_SEED must be an unsigned 32-bit integer");
    return 1;
  }
  console.log(`shared process: random order, seed ${seed} (HOUSTON_TEST_SEED)`);
  for (let i = shared.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((state / 2 ** 32) * (i + 1));
    [shared[i], shared[j]] = [shared[j], shared[i]];
  }

  const results = await Promise.all([
    run(shared, true),
    run(["--test-concurrency=3", ...ownProcess]),
  ]);
  const runs = [
    [`${shared.length} files in one process`, results[0]],
    [`${ownProcess.length} files in a process each`, results[1]],
  ];
  for (const [name, { code }] of runs)
    console.log(`${code === 0 ? "passed" : "FAILED"}: ${name}`);
  return results.every(({ code }) => code === 0) ? 0 : 1;
}

process.exitCode = await main();
