import { expect, test, vi } from "vitest";
import type { ObjectStore } from "./object-store";
import { syncBack } from "./sync-back";

const readdirMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readdir: readdirMock,
}));

test("an unreadable sync root throws instead of deleting every remote object", async () => {
  const denied = Object.assign(new Error("permission denied"), {
    code: "EACCES",
  });
  readdirMock.mockRejectedValueOnce(denied);
  const deleteObject = vi.fn(async () => undefined);
  const store: ObjectStore = {
    list: async () => [],
    download: async () => undefined,
    upload: async () => undefined,
    delete: deleteObject,
  };
  const manifest = new Map([
    ["owned.txt", { hash: "remote-hash", generation: "1" }],
  ]);

  await expect(syncBack(store, "", "/unreadable", manifest)).rejects.toBe(
    denied,
  );
  expect(deleteObject).not.toHaveBeenCalled();
});
