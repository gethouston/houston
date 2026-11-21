import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { Storage } from "@google-cloud/storage";
import { ObjectNotFoundError } from "@houston/runtime-client/object-sync";
import { describe, expect, test, vi } from "vitest";
import { GcsStore } from "./gcs-store";

test("GCS manifests propagate update timestamps without breaking pagination", async () => {
  const prefix = "ws/w1/agent-1";
  const session =
    "workspaces/Personal/Bob/.houston/runtime/sessions/c1/claude/projects";
  const older = `${session}/old/ffffffff.jsonl`;
  const newer = `${session}/current/00000000.jsonl`;
  const getFiles = vi.fn(async (_query: { prefix: string; fields: string }) => [
    [
      {
        name: `${prefix}/${older}`,
        metadata: {
          size: "10",
          md5Hash: "older-hash",
          updated: "2026-08-20T12:00:00.000Z",
        },
      },
      {
        name: `${prefix}/${newer}`,
        metadata: {
          size: "20",
          md5Hash: "newer-hash",
          updated: "2026-08-21T12:00:00.000Z",
        },
      },
    ],
  ]);
  const storage = {
    bucket: () => ({ getFiles }),
  } as unknown as Storage;
  const manifest = await new GcsStore("turns", storage).manifest(prefix);

  expect(manifest.map(({ key, updated }) => ({ key, updated }))).toEqual([
    {
      key: `${prefix}/${newer}`,
      updated: "2026-08-21T12:00:00.000Z",
    },
    {
      key: `${prefix}/${older}`,
      updated: "2026-08-20T12:00:00.000Z",
    },
  ]);
  expect(getFiles).toHaveBeenCalledWith({
    prefix: `${prefix}/`,
    fields: expect.stringContaining("updated"),
  });
  expect(getFiles.mock.calls[0]?.[0].fields).toContain("nextPageToken");
});

describe.skipIf(process.platform === "win32")("GCS sign-in state", () => {
  const STATE = ".houston/browser/state.json";

  function storeServing(body: string | Error) {
    const download = vi.fn();
    const createReadStream = vi.fn(() => {
      if (typeof body === "string") return Readable.from([body]);
      const failing = new Readable({ read() {} });
      queueMicrotask(() => failing.destroy(body));
      return failing;
    });
    const storage = {
      bucket: () => ({ file: () => ({ download, createReadStream }) }),
    } as unknown as Storage;
    return { store: new GcsStore("turns", storage), download };
  }

  test("lands owner-only through a temp file, replacing a planted symlink", async () => {
    const previous = process.umask(0o002);
    try {
      const work = mkdtempSync(join(tmpdir(), "gcs-private-"));
      const dest = join(work, STATE);
      mkdirSync(join(dest, ".."), { recursive: true, mode: 0o775 });
      const decoy = join(work, "decoy");
      writeFileSync(decoy, "untouched");
      symlinkSync(decoy, dest);
      const { store, download } = storeServing("{}");
      await store.download("k", dest);
      expect(download).not.toHaveBeenCalled();
      expect(readFileSync(decoy, "utf8")).toBe("untouched");
      expect(readFileSync(dest, "utf8")).toBe("{}");
      expect(statSync(dest).mode & 0o777).toBe(0o600);
      expect(statSync(join(dest, "..")).mode & 0o777).toBe(0o700);
      expect(readdirSync(join(dest, ".."))).toEqual(["state.json"]);
    } finally {
      process.umask(previous);
    }
  });

  test("a 404 mid-read is a vanished object and leaves no temp file", async () => {
    const work = mkdtempSync(join(tmpdir(), "gcs-private-"));
    const dest = join(work, STATE);
    const { store } = storeServing(
      Object.assign(new Error("gone"), { code: 404 }),
    );
    await expect(store.download("k", dest)).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
    expect(readdirSync(join(dest, ".."))).toEqual([]);
  });

  test("a refused private directory lands nothing and says so", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const work = mkdtempSync(join(tmpdir(), "gcs-private-"));
      const elsewhere = mkdtempSync(join(tmpdir(), "gcs-catch-"));
      mkdirSync(join(work, ".houston"));
      symlinkSync(elsewhere, join(work, ".houston", "browser"));
      const { store, download } = storeServing("{}");
      expect(await store.download("k", join(work, STATE))).toEqual({
        refused: true,
      });
      expect(download).not.toHaveBeenCalled();
      expect(readdirSync(elsewhere)).toEqual([]);
    } finally {
      error.mockRestore();
    }
  });
});
