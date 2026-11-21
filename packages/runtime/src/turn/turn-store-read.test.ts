import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { readStoreText } from "./turn-store-read";

test("a store read that stalls fails at its deadline instead of holding the turn's settle", async () => {
  const stalled: ObjectStore = {
    list: async () => [],
    download: (_key, _dest, opts) =>
      new Promise((_, reject) => {
        opts?.signal?.addEventListener("abort", () =>
          reject(opts.signal?.reason),
        );
      }),
    upload: async () => undefined,
    delete: async () => undefined,
  };

  await expect(
    readStoreText({ store: stalled, prefix: "p" }, "a.json", 20),
  ).rejects.toThrow();
});
