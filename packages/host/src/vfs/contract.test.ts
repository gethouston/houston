import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsVfs } from "./fs";
import { GcsVfs } from "./gcs";
import { MemoryVfs } from "./memory";
import type { Vfs } from "./vfs";

/**
 * The Vfs CONTRACT, run verbatim against every adapter — the anti-drift
 * mechanism for this port: an adapter that passes here is interchangeable, so
 * local (FsVfs) and cloud (GcsVfs/MemoryVfs) cannot quietly diverge in file
 * semantics. GcsVfs needs a real object store (a live GCS bucket or a local
 * fake-gcs-server emulator) — both external infra — so it runs through this SAME
 * suite only when HOUSTON_GCS_TEST_BUCKET is set; otherwise an explicit skip
 * records the gap with the one-command recipe (vfs/README-testing.md). It is
 * never faked green.
 */
export function runVfsContract(name: string, make: () => Vfs): void {
  describe(`Vfs contract: ${name}`, () => {
    const P = "ws/w1/agent-1";

    test("write/read text and bytes; missing keys read as null", async () => {
      const vfs = make();
      await vfs.writeText(`${P}/data/settings.json`, `{"a":1}`);
      await vfs.writeBytes(`${P}/workspace/deck.pptx`, Buffer.from([1, 2, 3]));

      expect(await vfs.readText(`${P}/data/settings.json`)).toBe(`{"a":1}`);
      const pptxBytes = await vfs.readBytes(`${P}/workspace/deck.pptx`);
      if (pptxBytes === null) throw new Error("expected bytes but got null");
      expect([...pptxBytes]).toEqual([1, 2, 3]);
      expect(await vfs.readText(`${P}/nope.txt`)).toBeNull();
      expect(await vfs.readBytes(`${P}/nope.bin`)).toBeNull();
    });

    test("list/listDetailed are prefix-scoped and sorted; no cross-prefix leak", async () => {
      const vfs = make();
      await vfs.writeText(`${P}/workspace/b.txt`, "b");
      await vfs.writeText(`${P}/workspace/a.txt`, "a");
      await vfs.writeText(`ws/w1/agent-2/workspace/other.txt`, "other agent");

      const keys = await vfs.list(P);
      expect(keys).toEqual([`${P}/workspace/a.txt`, `${P}/workspace/b.txt`]);

      const detailed = await vfs.listDetailed(P);
      expect(detailed.map((d) => d.key)).toEqual(keys);
      expect(detailed.every((d) => d.size > 0)).toBe(true);
      expect(JSON.stringify(detailed)).not.toContain("agent-2");
    });

    test("a prefix that is itself a key-prefix string does NOT leak (ws/w1 vs ws/w10)", async () => {
      const vfs = make();
      await vfs.writeText(`ws/w1/a/f.txt`, "one");
      await vfs.writeText(`ws/w10/a/f.txt`, "ten");
      expect(await vfs.list("ws/w1")).toEqual(["ws/w1/a/f.txt"]);
    });

    test("move renames; moving a missing source throws", async () => {
      const vfs = make();
      await vfs.writeText(`${P}/workspace/old.txt`, "content");
      await vfs.move(`${P}/workspace/old.txt`, `${P}/workspace/new.txt`);
      expect(await vfs.readText(`${P}/workspace/old.txt`)).toBeNull();
      expect(await vfs.readText(`${P}/workspace/new.txt`)).toBe("content");

      await expect(vfs.move(`${P}/ghost.txt`, `${P}/x.txt`)).rejects.toThrow(
        "source not found",
      );
    });

    test("deleteKey is idempotent; deletePrefix removes only the prefix", async () => {
      const vfs = make();
      await vfs.writeText(`${P}/workspace/f.txt`, "f");
      await vfs.writeText(`ws/w1/agent-2/keep.txt`, "keep");

      await vfs.deleteKey(`${P}/workspace/f.txt`);
      await vfs.deleteKey(`${P}/workspace/f.txt`); // absent → no-op
      expect(await vfs.readText(`${P}/workspace/f.txt`)).toBeNull();

      await vfs.writeText(`${P}/data/a.json`, "{}");
      await vfs.deletePrefix(P);
      expect(await vfs.list(P)).toEqual([]);
      expect(await vfs.readText(`ws/w1/agent-2/keep.txt`)).toBe("keep");
    });

    test("traversal keys are rejected, never mapped", async () => {
      const vfs = make();
      await expect(
        vfs.writeText(`${P}/../../../etc/passwd`, "x"),
      ).rejects.toThrow("unsafe vfs key");
      await expect(vfs.writeText(`/absolute.txt`, "x")).rejects.toThrow(
        "unsafe vfs key",
      );
      await expect(
        vfs.move(`${P}/a.txt`, `${P}/../escape.txt`),
      ).rejects.toThrow();
    });
  });
}

runVfsContract("MemoryVfs", () => new MemoryVfs());
runVfsContract(
  "FsVfs",
  () => new FsVfs(mkdtempSync(join(tmpdir(), "houston-vfs-"))),
);

/**
 * GcsVfs against a REAL object store. The @google-cloud/storage client speaks the
 * JSON API to either a live GCS bucket or a local emulator (fsouza/fake-gcs-server
 * via Testcontainers / docker run) — both are external infra, so this run is
 * env-gated rather than always-on. With HOUSTON_GCS_TEST_BUCKET set, the EXACT
 * same runVfsContract assertions (Memory/Fs already pass) run against the real
 * GcsVfs adapter; otherwise a single explicit skip records the gap with the
 * one-command recipe to close it. See vfs/README-testing.md.
 *
 * Each contract `make()` needs an isolated namespace inside the shared bucket so
 * cross-prefix assertions hold; we prefix every key with a per-make run id by
 * wrapping the adapter (no adapter change — the prefix lives entirely in the test
 * key space, mirroring the workspace/agent prefixes the contract already uses).
 */
const gcsBucket = process.env.HOUSTON_GCS_TEST_BUCKET;
if (gcsBucket) {
  const endpoint = process.env.HOUSTON_GCS_TEST_ENDPOINT; // e.g. fake-gcs-server
  let runSeq = 0;
  runVfsContract("GcsVfs (live bucket)", () => {
    const { Storage } = require("@google-cloud/storage");
    // An emulator endpoint short-circuits ADC + uses path-style addressing; a
    // real bucket relies on ambient ADC (gcloud auth / a mounted SA key).
    const storage = endpoint
      ? new Storage({ apiEndpoint: endpoint, projectId: "houston-test" })
      : new Storage();
    const base = new GcsVfs(gcsBucket, storage);
    // Namespace each contract instance under a fresh prefix in the shared bucket
    // so independent `make()`s never see each other's objects.
    const ns = `vfs-contract-run-${process.pid}-${runSeq++}`;
    return prefixed(base, ns);
  });
} else {
  test.skip("Vfs contract: GcsVfs (set HOUSTON_GCS_TEST_BUCKET — see vfs/README-testing.md)", () => {});
}

/**
 * Wrap a Vfs so every key is transparently scoped under `ns/…`. Keeps each
 * contract instance isolated inside one shared test bucket. Pure key-space
 * rewriting in the test — the adapter under test is untouched.
 */
function prefixed(inner: Vfs, ns: string): Vfs {
  const k = (key: string) => `${ns}/${key}`;
  const unk = (key: string) => key.slice(ns.length + 1);
  return {
    writeText: (key, c) => inner.writeText(k(key), c),
    writeBytes: (key, c) => inner.writeBytes(k(key), c),
    readText: (key) => inner.readText(k(key)),
    readBytes: (key) => inner.readBytes(k(key)),
    list: async (prefix) => (await inner.list(k(prefix))).map(unk),
    listDetailed: async (prefix) =>
      (await inner.listDetailed(k(prefix))).map((s) => ({
        ...s,
        key: unk(s.key),
      })),
    move: (from, to) => inner.move(k(from), k(to)),
    deleteKey: (key) => inner.deleteKey(k(key)),
    deletePrefix: (prefix) => inner.deletePrefix(k(prefix)),
  };
}
