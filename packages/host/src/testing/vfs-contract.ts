import { describe, expect, test } from "vitest";
import type { Vfs } from "../vfs/vfs";

/**
 * The Vfs CONTRACT, run verbatim against every adapter — the anti-drift
 * mechanism for this port: an adapter that passes here is interchangeable, so
 * local (FsVfs) and cloud (GcsVfs/MemoryVfs) cannot quietly diverge in file
 * semantics.
 *
 * Exported from `@houston/host` (OPEN) so BOTH the open adapter suite
 * (vfs/contract.test.ts: Memory/Fs) AND the closed adapter suite in
 * `@houston/host-cloud` (vfs/gcs.contract.test.ts: GcsVfs against a real object
 * store, env-gated on HOUSTON_GCS_TEST_BUCKET) run the SAME assertions. It is
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

    test("listDetailed on a plain-file prefix answers empty, never throws", async () => {
      const vfs = make();
      await vfs.writeText(`${P}/workspace/report.txt`, "x");
      // A file is not a prefix — no keys live UNDER it. The Files tab's delete
      // path relies on this to tell files from folders.
      expect(await vfs.listDetailed(`${P}/workspace/report.txt`)).toEqual([]);
    });

    test("createdMs, when reported, survives overwrite and move", async () => {
      const vfs = make();
      await vfs.writeText(`${P}/workspace/doc.txt`, "v1");
      const first = (await vfs.listDetailed(P))[0];
      if (first?.createdMs === undefined) return; // backend has no birthtime — allowed
      await vfs.writeText(`${P}/workspace/doc.txt`, "v2 (longer content)");
      const overwritten = (await vfs.listDetailed(P))[0];
      expect(overwritten?.createdMs).toBe(first.createdMs);
      await vfs.move(`${P}/workspace/doc.txt`, `${P}/workspace/renamed.txt`);
      const moved = (await vfs.listDetailed(P))[0];
      expect(moved?.createdMs).toBe(first.createdMs);
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

/**
 * Wrap a Vfs so every key is transparently scoped under `ns/…`. Keeps each
 * contract instance isolated inside one shared test bucket (the GcsVfs live-bucket
 * run needs this; Memory/Fs get a fresh dir each `make()`). Pure key-space
 * rewriting in the test — the adapter under test is untouched.
 */
export function prefixed(inner: Vfs, ns: string): Vfs {
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
