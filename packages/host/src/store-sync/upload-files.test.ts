import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type ObjectStore,
  UploadCopyExistsError,
} from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import { SyncedUploadFiles } from "./upload-files";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
  roots.length = 0;
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "upload-copy-"));
  roots.push(root);
  const key = "workspaces/main/agent/uploads/file.txt";
  await mkdir(dirname(join(root, key)), { recursive: true });
  const objects = new Map<string, { bytes: Buffer; generation: string }>();
  const bytes = Buffer.from("staged bytes");
  let generation = 20;
  const copyUpload = vi.fn(
    async (_id: string, destination: string, _source: string) => {
      if (objects.has(destination))
        throw new UploadCopyExistsError(destination);
      const copied = { bytes, generation: String(++generation) };
      objects.set(destination, copied);
      return {
        key: destination,
        generation: copied.generation,
        size: bytes.length,
      };
    },
  );
  const download = vi.fn(async (source: string, target: string) => {
    const object = objects.get(source);
    if (!object) throw new Error("missing object");
    await writeFile(target, object.bytes);
    return { generation: object.generation };
  });
  const deleteObject = vi.fn<ObjectStore["delete"]>(
    async (destination, opts) => {
      const object = objects.get(destination);
      if (
        opts?.ifGenerationMatch &&
        opts.ifGenerationMatch !== object?.generation
      )
        throw new Error("generation changed");
      objects.delete(destination);
    },
  );
  const store: ObjectStore = {
    list: async () => [...objects.keys()],
    upload: async () => {
      throw new Error("unexpected upload");
    },
    download,
    delete: deleteObject,
    copyUpload,
    readUpload: async () => bytes,
  };
  const files = new SyncedUploadFiles({ rootDir: root, store, log: vi.fn() });
  return {
    files,
    root,
    key,
    objects,
    bytes,
    copyUpload,
    download,
    deleteObject,
  };
}

test.each([
  "download",
  "size",
])("a %s failure removes the copied generation so retry can succeed", async (failure) => {
  const s = await setup();
  if (failure === "download")
    s.download.mockRejectedValueOnce(new Error("download failed"));
  else
    s.download.mockImplementationOnce(async (_key, dest) => {
      await writeFile(dest, "short");
      return { generation: "21" };
    });
  await expect(
    s.files.copyUpload("upload_session_0001", s.key, "10"),
  ).rejects.toThrow();
  expect(s.deleteObject).toHaveBeenCalledWith(s.key, {
    ifGenerationMatch: "21",
  });
  expect(s.objects.has(s.key)).toBe(false);
  expect(s.files.manifest.has(s.key)).toBe(false);
  await s.files.copyUpload("upload_session_0001", s.key, "10");
  expect(await readFile(join(s.root, s.key))).toEqual(s.bytes);
  expect(s.files.manifest.get(s.key)?.generation).toBe("22");
});

test("a failed cleanup preserves the deletion failure as cause", async () => {
  const s = await setup();
  const deletion = new Error("store delete failed");
  s.download.mockRejectedValueOnce(new Error("download failed"));
  s.deleteObject.mockRejectedValueOnce(deletion);
  await expect(
    s.files.copyUpload("upload_session_0001", s.key, "10"),
  ).rejects.toMatchObject({ cause: deletion });
});

test("a locally deleted object is removed before one copy retry and stays in the sync baseline", async () => {
  const s = await setup();
  s.objects.set(s.key, { bytes: Buffer.from("old"), generation: "19" });
  s.files.manifest.set(s.key, { hash: "old", generation: "19" });
  await s.files.copyUpload("upload_session_0001", s.key, "10");
  expect(s.copyUpload).toHaveBeenCalledTimes(2);
  expect(s.deleteObject).toHaveBeenCalledWith(s.key);
  expect(await readFile(join(s.root, s.key))).toEqual(s.bytes);
  await s.files.sync([]);
  expect(s.objects.get(s.key)?.bytes).toEqual(s.bytes);
  expect(s.deleteObject).toHaveBeenCalledTimes(1);
});

test("an existing local file keeps its store object and copy refusal", async () => {
  const s = await setup();
  s.objects.set(s.key, { bytes: Buffer.from("old"), generation: "19" });
  await writeFile(join(s.root, s.key), "local");
  await expect(
    s.files.copyUpload("upload_session_0001", s.key, "10"),
  ).rejects.toBeInstanceOf(UploadCopyExistsError);
  expect(s.deleteObject).not.toHaveBeenCalled();
  expect(await readFile(join(s.root, s.key), "utf8")).toBe("local");
});

test("a second copy refusal surfaces after one orphan retry", async () => {
  const s = await setup();
  s.copyUpload.mockRejectedValue(new UploadCopyExistsError(s.key));
  await expect(
    s.files.copyUpload("upload_session_0001", s.key, "10"),
  ).rejects.toBeInstanceOf(UploadCopyExistsError);
  expect(s.copyUpload).toHaveBeenCalledTimes(2);
  expect(s.deleteObject).toHaveBeenCalledTimes(1);
});
