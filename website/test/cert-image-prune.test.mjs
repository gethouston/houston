// Pruning of stale certificate images (lib/certs/image-cache.mjs).
//
// The CI deploy restores `_site/c` from a cache between builds, so images for
// certificates that are no longer issued would otherwise persist forever.
// pruneStaleImages must delete exactly those, both the printable PNG and the
// social card, and leave everything else (current codes, non-PNG files) alone.
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { manifestText, pruneStaleImages } from "../lib/certs/image-cache.mjs";

async function makeDir(files) {
  const dir = await mkdtemp(join(tmpdir(), "cert-prune-"));
  for (const name of files) await writeFile(join(dir, name), "x");
  return dir;
}

test("deletes both images of a code that is no longer issued", async (t) => {
  const dir = await makeDir([
    "KEEP1.png",
    "KEEP1.og.png",
    "GONE1.png",
    "GONE1.og.png",
  ]);
  t.after(() => rm(dir, { recursive: true, force: true }));

  const pruned = await pruneStaleImages(dir, new Set(["KEEP1"]));

  assert.equal(pruned, 2);
  assert.deepEqual((await readdir(dir)).sort(), ["KEEP1.og.png", "KEEP1.png"]);
});

test("keeps every current code and non-PNG files untouched", async (t) => {
  const dir = await makeDir(["A.png", "A.og.png", "B.png", "notes.txt"]);
  t.after(() => rm(dir, { recursive: true, force: true }));

  const pruned = await pruneStaleImages(dir, new Set(["A", "B"]));

  assert.equal(pruned, 0);
  assert.deepEqual((await readdir(dir)).sort(), [
    "A.og.png",
    "A.png",
    "B.png",
    "notes.txt",
  ]);
});

test("a code whose name contains dots prunes cleanly", async (t) => {
  const dir = await makeDir(["X.Y.png", "X.Y.og.png"]);
  t.after(() => rm(dir, { recursive: true, force: true }));

  const pruned = await pruneStaleImages(dir, new Set());

  assert.equal(pruned, 2);
  assert.deepEqual(await readdir(dir), []);
});

test("a missing directory is a no-op, not a crash", async () => {
  const pruned = await pruneStaleImages(
    join(tmpdir(), "cert-prune-does-not-exist"),
    new Set(["A"]),
  );
  assert.equal(pruned, 0);
});

// The deploy keys its image cache on a hash of the manifest, so the same set of
// images has to write the same bytes whatever order the renders finished in.
test("the image manifest is the same bytes in any order", () => {
  const a = manifestText({ ZZ9: "d3", AB1: "d1", MM5: "d2" });
  const b = manifestText({ MM5: "d2", AB1: "d1", ZZ9: "d3" });
  assert.equal(a, b);
  assert.deepEqual(Object.keys(JSON.parse(a)), ["AB1", "MM5", "ZZ9"]);
});
