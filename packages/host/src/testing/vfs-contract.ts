import { describe, expect, test } from "vitest";
import { type Vfs, VfsExistsError } from "../vfs/vfs";

/**
 * The Vfs CONTRACT, run verbatim against every adapter — the anti-drift
 * mechanism for this port: an adapter that passes here is interchangeable, so
 * local (FsVfs) and cloud (GcsVfs/MemoryVfs) cannot quietly diverge in file
 * semantics.
 *
 * Exported from `@houston/host` (OPEN) and run by the open adapter suite
 * (vfs/contract.test.ts: Memory/Fs). The closed GcsVfs suite that also
 * consumed it was retired with `@houston/host-cloud` (git history); the
 * contract stays exported as the behavioral bar for any out-of-repo adapter.
 * It is never faked green.
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

    test("keyCase tells the truth about how this backend compares names", async () => {
      // The collision guards in `turn/files-names.ts` trust this answer to
      // decide whether a rename would destroy a neighbouring file, so an
      // adapter that merely REPORTS a fold it does not perform (or hides one
      // it does) is worse than no answer at all. Runs on either kind of CI
      // volume: the assertion is the adapter's own claim, checked against it.
      const vfs = make();
      await vfs.writeText(`${P}/workspace/readme.md`, "doc");
      const { fold, normalize } = await vfs.keyCase();
      expect(await vfs.readText(`${P}/workspace/README.md`)).toBe(
        fold === "folded" ? "doc" : null,
      );
      // Same question for Unicode: macOS stores a name DECOMPOSED and every
      // browser sends it COMPOSED, so a backend that resolves the two to one
      // object has to say so or the guards compare bytes that never match.
      const nfd = `${P}/workspace/informe-espan\u0303a.pdf`;
      await vfs.writeText(nfd, "informe");
      expect(await vfs.readText(nfd.normalize("NFC"))).toBe(
        normalize ? "informe" : null,
      );
    });

    test("exists answers with the backend's own name resolution", async () => {
      // The upload dedupe decides a WRITE destination with this, and a write
      // that lands on an object it did not know about replaces it in silence.
      const vfs = make();
      await vfs.writeText(`${P}/workspace/report.pdf`, "one");
      expect(await vfs.exists(`${P}/workspace/report.pdf`)).toBe(true);
      expect(await vfs.exists(`${P}/workspace/absent.pdf`)).toBe(false);
      const { fold } = await vfs.keyCase();
      expect(await vfs.exists(`${P}/workspace/REPORT.pdf`)).toBe(
        fold === "folded",
      );
      await vfs.deleteKey(`${P}/workspace/report.pdf`);
      expect(await vfs.exists(`${P}/workspace/report.pdf`)).toBe(false);
    });

    test("readText drops a leading BOM; readBytes keeps the file verbatim", async () => {
      // A files-first doc can be written by any editor or agent, and plenty
      // emit a UTF-8 BOM. `JSON.parse` rejects one outright, so a BOM'd
      // routines.json bricked every routine on a pod (HOU-953). Text reads
      // decode it away; byte reads stay lossless (downloads, binary seeds).
      const vfs = make();
      const bommed = `﻿[{"id":"a"}]`;
      await vfs.writeBytes(
        `${P}/data/routines.json`,
        Buffer.from(bommed, "utf8"),
      );

      const text = await vfs.readText(`${P}/data/routines.json`);
      expect(text).toBe(`[{"id":"a"}]`);
      expect(JSON.parse(text as string)).toEqual([{ id: "a" }]);
      expect((await vfs.readBytes(`${P}/data/routines.json`))?.length).toBe(
        Buffer.byteLength(bommed, "utf8"),
      );
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

    test("move refuses a destination holding a DIFFERENT object", async () => {
      // `rename(2)` and an object-store overwrite both replace the destination
      // without a word, and the caller's pre-check cannot know the volume's
      // fold table. This is the door that has to hold, so every adapter shuts
      // it: the neighbour survives, and the refusal is typed.
      const vfs = make();
      await vfs.writeText(`${P}/workspace/notes.md`, "mine");
      await vfs.writeText(`${P}/workspace/budget.md`, "theirs");
      await expect(
        vfs.move(`${P}/workspace/notes.md`, `${P}/workspace/budget.md`),
      ).rejects.toBeInstanceOf(VfsExistsError);
      expect(await vfs.readText(`${P}/workspace/budget.md`)).toBe("theirs");
      expect(await vfs.readText(`${P}/workspace/notes.md`)).toBe("mine");
    });

    test("a case-only re-spell of one object is a rename, not a collision", async () => {
      // On a folded backend the destination "exists" — it IS the source. A
      // guard that read that as a collision would make the file impossible to
      // re-capitalize, which is a rename users do all the time.
      const vfs = make();
      await vfs.writeText(`${P}/workspace/readme.md`, "doc");
      await vfs.move(`${P}/workspace/readme.md`, `${P}/workspace/README.md`);
      expect(await vfs.readText(`${P}/workspace/README.md`)).toBe("doc");
      const keys = await vfs.list(`${P}/workspace`);
      expect(keys).toEqual([`${P}/workspace/README.md`]);
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

    test("createdMs, when reported, survives move; overwrite may reset it", async () => {
      const vfs = make();
      await vfs.writeText(`${P}/workspace/doc.txt`, "v1");
      const first = (await vfs.listDetailed(P))[0];
      if (first?.createdMs === undefined) return; // backend has no birthtime — allowed
      // Overwrite: ATOMIC replacement (tmp+rename) is required of adapters — a
      // plain in-place write let concurrent readers observe a truncated file
      // (the activity.json torn-read 500s). Replacing the inode is how every
      // atomic save works (editors included), and a filesystem's birthtime does
      // not survive it — so overwrite only guarantees a createdMs that is
      // never NEWER than the write itself, not the original stamp.
      await vfs.writeText(`${P}/workspace/doc.txt`, "v2 (longer content)");
      const overwritten = (await vfs.listDetailed(P))[0];
      expect(overwritten?.createdMs ?? 0).toBeLessThanOrEqual(Date.now());
      const afterOverwrite = overwritten?.createdMs;
      // Move is a pure rename: the inode travels, so createdMs must survive.
      await vfs.move(`${P}/workspace/doc.txt`, `${P}/workspace/renamed.txt`);
      const moved = (await vfs.listDetailed(P))[0];
      expect(moved?.createdMs).toBe(afterOverwrite);
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
