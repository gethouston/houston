import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { HydrateManifest } from "./hydrate";
import type { ObjectStore } from "./object-store";
import { syncBack } from "./sync-back";

const posixOnly = process.platform === "win32" ? describe.skip : describe;
const STATE = ".houston/browser/state.json";

function recordingStore() {
  const uploads: string[] = [];
  const deletes: string[] = [];
  const store: ObjectStore = {
    list: async () => [],
    download: async () => undefined,
    upload: async (_src, key) => {
      uploads.push(key);
      return { generation: "2" };
    },
    delete: async (key) => {
      deletes.push(key);
    },
  };
  return { store, uploads, deletes };
}

function agent(browser: "real" | "none") {
  const root = mkdtempSync(join(tmpdir(), "houston-syncback-private-"));
  mkdirSync(join(root, ".houston"));
  writeFileSync(join(root, "notes.md"), "hi");
  if (browser === "real") {
    mkdirSync(join(root, ".houston", "browser"), { mode: 0o775 });
    writeFileSync(join(root, STATE), '{"cookies":["planted"],"origins":[]}');
  }
  return root;
}

function asSomeoneElse() {
  const uid = process.getuid?.() ?? 0;
  const posix = process as { getuid: () => number };
  vi.spyOn(posix, "getuid").mockReturnValue(uid + 1);
}

afterEach(() => {
  vi.restoreAllMocks();
});

posixOnly("sync-back of the browser's private directory", () => {
  test("a directory another user owns is never uploaded, and logged once", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = agent("real");
    asSomeoneElse();
    const { store, uploads } = recordingStore();
    const first = await syncBack(store, "p", root, new Map(), {
      generations: true,
    });
    expect(uploads).toEqual(["p/notes.md"]);
    expect(first.manifest.has(STATE)).toBe(false);
    await syncBack(store, "p", root, first.manifest, { generations: true });
    expect(uploads).toEqual(["p/notes.md"]);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toMatch(
      /not syncing sign-in state: .*browser is owned by uid/,
    );
  });

  test("a refused directory keeps the remote copy: no delete, entry kept", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const root = agent("real");
    asSomeoneElse();
    const { store, uploads, deletes } = recordingStore();
    const owned: HydrateManifest = new Map([
      [STATE, { hash: "the-person's", generation: "7" }],
      [".houston/browser/old.json", { hash: "older", generation: "3" }],
    ]);
    const result = await syncBack(store, "p", root, owned);
    expect(uploads).toEqual(["p/notes.md"]);
    expect(deletes).toEqual([]);
    expect(result.manifest.get(STATE)).toEqual(owned.get(STATE));
    expect(result.manifest.has(".houston/browser/old.json")).toBe(true);
  });

  test("a missing or symlinked directory deletes nothing under it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const owned = (): HydrateManifest =>
      new Map([[STATE, { hash: "the-person's", generation: "7" }]]);
    const { store, deletes } = recordingStore();
    const missing = agent("none");
    expect((await syncBack(store, "p", missing, owned())).manifest.size).toBe(
      2,
    );
    const linked = agent("none");
    const elsewhere = mkdtempSync(join(tmpdir(), "houston-elsewhere-"));
    symlinkSync(elsewhere, join(linked, ".houston", "browser"));
    await syncBack(store, "p", linked, owned());
    expect(deletes).toEqual([]);
  });

  test("this process's own directory uploads its state and deletes nothing", async () => {
    const root = agent("real");
    const { store, uploads, deletes } = recordingStore();
    const owned: HydrateManifest = new Map([
      [".houston/browser/old.json", { hash: "older", generation: "3" }],
    ]);
    const result = await syncBack(store, "p", root, owned, {
      generations: true,
    });
    expect(uploads.sort()).toEqual([`p/${STATE}`, "p/notes.md"]);
    expect(deletes).toEqual([]);
    expect(result.manifest.get(".houston/browser/old.json")).toEqual({
      hash: "older",
      generation: "3",
    });
  });

  test("only a real storage state named state.json uploads", async () => {
    const root = agent("none");
    mkdirSync(join(root, ".houston", "browser"), { mode: 0o700 });
    writeFileSync(join(root, ".houston/browser/board.json"), '{"cards":[]}');
    writeFileSync(join(root, STATE), '{"cards":[]}');
    const { store, uploads, deletes } = recordingStore();
    await syncBack(store, "p", root, new Map(), { generations: true });
    expect(uploads).toEqual(["p/notes.md"]);
    expect(deletes).toEqual([]);
  });
});
