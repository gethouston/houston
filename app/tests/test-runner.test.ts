import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const runner = fileURLToPath(
  new URL("../scripts/run-tests.mjs", import.meta.url),
);

test("runner reproduces seeded execution order and propagates failures", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "houston-test-runner-"));
  t.after(() => rm(cwd, { recursive: true }));
  await mkdir(join(cwd, "tests"));
  await symlink(
    fileURLToPath(new URL("../node_modules", import.meta.url)),
    join(cwd, "node_modules"),
  );
  await writeFile(join(cwd, "tests/own-process.txt"), "tests/own.test.ts\n");
  const own = join(cwd, "tests/own.test.ts");
  await writeFile(
    own,
    'import {test} from "node:test"; test("own", () => {});',
  );
  for (const name of ["a", "b", "c", "d"]) {
    await writeFile(
      join(cwd, `tests/${name}.test.ts`),
      `import {test} from "node:test"; test("ORDER:${name}", () => {});`,
    );
  }
  const outputs: string[][] = [];
  for (const seed of ["1", "1", "8192"]) {
    const { stdout } = await exec(process.execPath, [runner], {
      cwd,
      env: { ...process.env, HOUSTON_TEST_SEED: seed },
    });
    assert.match(stdout, new RegExp(`random order, seed ${seed} `));
    const order = [...stdout.matchAll(/ORDER:([a-d])/g)].map(
      (match) => match[1],
    );
    assert.equal(order.length, 4);
    outputs.push(order);
  }
  assert.deepEqual(outputs[0], outputs[1]);
  assert.notDeepEqual(outputs[0], outputs[2]);

  for (const [file, group] of [
    [join(cwd, "tests/a.test.ts"), "4 files in one process"],
    [own, "1 files in a process each"],
  ]) {
    await writeFile(
      file,
      'import {test} from "node:test"; test("planted failure", () => { throw new Error("PLANTED"); });',
    );
    await assert.rejects(exec(process.execPath, [runner], { cwd }), (error) => {
      assert.ok(error instanceof Error && "code" in error && "stdout" in error);
      assert.equal(error.code, 1);
      assert.match(String(error.stdout), /PLANTED/);
      assert.ok(String(error.stdout).includes(`FAILED: ${group}`));
      return true;
    });
    await writeFile(
      file,
      'import {test} from "node:test"; test("clean", () => {});',
    );
  }
});
