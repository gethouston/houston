import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { HydrateManifest } from "./hydrate";
import type { ObjectStore } from "./object-store";
import { syncBack } from "./sync-back";

const afterGate = vi.hoisted(() => ({ hook: async () => {} }));

vi.mock("./private-dir-gate", async (original) => {
  const real = await original<typeof import("./private-dir-gate")>();
  return {
    privateDirGate: () => {
      const gate = real.privateDirGate();
      return async (file: string) => {
        const verdict = await gate(file);
        await afterGate.hook();
        return verdict;
      };
    },
  };
});

const posixOnly = process.platform === "win32" ? describe.skip : describe;
const STATE = ".houston/browser/state.json";
const KEPT: HydrateManifest = new Map([
  [STATE, { hash: "the-person's", generation: "7" }],
]);

function recordingStore() {
  const uploads = new Map<string, string>();
  const deletes: string[] = [];
  const store: ObjectStore = {
    list: async () => [],
    download: async () => undefined,
    upload: async (src, key) => {
      uploads.set(key, readFileSync(src, "utf8"));
      return { generation: "8" };
    },
    delete: async (key) => {
      deletes.push(key);
    },
  };
  return { store, uploads, deletes };
}

function agent() {
  const root = mkdtempSync(join(tmpdir(), "houston-syncback-file-"));
  mkdirSync(join(root, ".houston", "browser"), {
    recursive: true,
    mode: 0o700,
  });
  writeFileSync(join(root, STATE), '{"cookies":["the person"],"origins":[]}');
  return root;
}

afterEach(() => {
  afterGate.hook = async () => {};
  vi.restoreAllMocks();
});

posixOnly("sync-back checks each sign-in file where it reads it", () => {
  test("the worker's own file uploads the bytes it checked", async () => {
    const { store, uploads } = recordingStore();
    const result = await syncBack(store, "p", agent(), new Map(), {
      generations: true,
    });
    expect(uploads.get(`p/${STATE}`)).toBe(
      '{"cookies":["the person"],"origins":[]}',
    );
    expect(result.manifest.get(STATE)?.generation).toBe("8");
  });

  test("a file another uid owns is skipped, its entry kept, logged once", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = agent();
    const uid = process.getuid?.() ?? 0;
    afterGate.hook = async () => {
      vi.spyOn(process as { getuid: () => number }, "getuid").mockReturnValue(
        uid + 1,
      );
    };
    const { store, uploads, deletes } = recordingStore();
    const first = await syncBack(store, "p", root, KEPT);
    await syncBack(store, "p", root, first.manifest);
    expect(uploads.size).toBe(0);
    expect(deletes).toEqual([]);
    expect(first.manifest.get(STATE)).toEqual(KEPT.get(STATE));
    const lines = error.mock.calls.map(([line]) => String(line));
    expect(
      lines.filter((l) => l.includes("state.json is owned by uid")),
    ).toHaveLength(1);
  });

  test("a symlinked file is never uploaded through", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const root = agent();
    const secret = join(mkdtempSync(join(tmpdir(), "secret-")), "secret");
    writeFileSync(secret, "the worker's secret");
    afterGate.hook = async () => {
      renameSync(join(root, STATE), join(root, ".houston", "browser", "x"));
      symlinkSync(secret, join(root, STATE));
    };
    const { store, uploads } = recordingStore();
    const result = await syncBack(store, "p", root, KEPT);
    expect(uploads.has(`p/${STATE}`)).toBe(false);
    expect(result.manifest.get(STATE)).toEqual(KEPT.get(STATE));
  });

  test("a directory swapped in after the gate feeds no upload", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const root = agent();
    const browser = join(root, ".houston", "browser");
    const planted = mkdtempSync(join(tmpdir(), "planted-"));
    const plantedState = join(
      mkdtempSync(join(tmpdir(), "elsewhere-")),
      "state.json",
    );
    writeFileSync(plantedState, '{"cookies":["planted"],"origins":[]}');
    symlinkSync(plantedState, join(planted, "state.json"));
    afterGate.hook = async () => {
      renameSync(browser, join(root, ".houston", "browser-real"));
      symlinkSync(planted, browser);
    };
    const { store, uploads } = recordingStore();
    const result = await syncBack(store, "p", root, KEPT);
    expect(uploads.has(`p/${STATE}`)).toBe(false);
    expect(result.manifest.get(STATE)).toEqual(KEPT.get(STATE));
  });
  test("a swapped-in directory holding a hard link to our own file feeds no upload", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const root = agent();
    const browser = join(root, ".houston", "browser");
    const ours = join(root, "notes.json");
    writeFileSync(ours, '{"cookies":["planted"],"origins":[]}');
    const planted = mkdtempSync(join(tmpdir(), "planted-"));
    linkSync(ours, join(planted, "state.json"));
    let swapped = false;
    afterGate.hook = async () => {
      if (swapped) return;
      swapped = true;
      renameSync(browser, join(root, ".houston", "browser-real"));
      renameSync(planted, browser);
    };
    const { store, uploads } = recordingStore();
    const result = await syncBack(store, "p", root, KEPT);
    expect(uploads.has(`p/${STATE}`)).toBe(false);
    expect(result.manifest.get(STATE)).toEqual(KEPT.get(STATE));
  });
});
