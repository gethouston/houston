import { zipSync } from "fflate";
import { expect, test } from "vitest";
import { unzipCapped, ZipLimitError } from "./capped-unzip";
import {
  applyMigrationArchive,
  MigrationImportError,
} from "./migration-import";

const bytes = (n: number) => new Uint8Array(n);

function declareSize(zip: Uint8Array, size: number): Uint8Array {
  const out = zip.slice();
  const view = new DataView(out.buffer);
  for (let i = 0; i + 4 <= out.length; i++)
    if (view.getUint32(i, true) === 0x02014b50)
      view.setUint32(i + 24, size, true);
  return out;
}

function breach(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof ZipLimitError ? err.breach : "other";
  }
}

const limits = { maxEntries: 3, maxUnpackedBytes: 1000 };

test("an archive under both limits unpacks, directories aside", () => {
  const zip = zipSync({
    "a.txt": bytes(400),
    "dir/": bytes(0),
    "b.txt": bytes(500),
  });
  const entries = unzipCapped(zip, limits);
  expect(entries.map(([name, data]) => [name, data.length])).toEqual([
    ["a.txt", 400],
    ["b.txt", 500],
  ]);
});

test("more inflated bytes than the cap refuses the archive", () => {
  const zip = zipSync({ "a.txt": bytes(600), "b.txt": bytes(600) });
  expect(breach(() => unzipCapped(zip, limits))).toBe("too_large");
});

test("stored entries count toward the cap too", () => {
  const zip = zipSync({ "a.bin": bytes(1200) }, { level: 0 });
  expect(breach(() => unzipCapped(zip, limits))).toBe("too_large");
});

test("more entries than the cap refuses the archive", () => {
  const files = Object.fromEntries(
    ["a", "b", "c", "d"].map((n) => [n, bytes(1)]),
  );
  expect(breach(() => unzipCapped(zipSync(files), limits))).toBe(
    "too_many_entries",
  );
});

test("an entry never inflates past the size it declares", () => {
  const zip = declareSize(zipSync({ "a.txt": bytes(100_000) }), 10);
  const [[, data] = ["", bytes(0)]] = unzipCapped(zip, limits);
  expect(data.length).toBeLessThanOrEqual(10);
});

test("a declared size past the cap is refused before it inflates", async () => {
  const zip = declareSize(
    zipSync({ "notes/a.txt": bytes(10) }),
    600 * 1024 * 1024,
  );
  const imported = applyMigrationArchive({
    vfs: {} as never,
    root: "workspaces/Personal/Assistant",
    bytes: Buffer.from(zip),
    overwrite: false,
  });
  await expect(imported).rejects.toBeInstanceOf(MigrationImportError);
  await expect(imported).rejects.toMatchObject({ status: 413 });
});
