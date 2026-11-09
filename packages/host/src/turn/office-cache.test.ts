import {
  mkdtemp,
  open,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ATOMIC_TMP_SUFFIX } from "@houston/protocol";
import { expect, test } from "vitest";
import { createOfficePreview } from "./files-office";

test("writes remove expired previews, abandoned temps and oldest entries over one GiB", async () => {
  const cache = await mkdtemp(join(tmpdir(), "office-retention-"));
  try {
    const now = Date.now();
    const seed = async (key: string, size: number, age: number) => {
      const path = join(cache, `${key}.pdf`);
      const file = await open(path, "w");
      await file.truncate(size);
      await file.close();
      await writeFile(
        join(cache, `${key}.json`),
        '{"pageCount":1,"version":"v1"}',
      );
      await utimes(path, new Date(now - age), new Date(now - age));
    };
    await seed("expired", 10, 31 * 24 * 60 * 60_000);
    await seed("oldest", 600 * 1024 * 1024, 10_000);
    await seed("newest", 600 * 1024 * 1024, 5_000);
    const abandoned = join(cache, `abandoned${ATOMIC_TMP_SUFFIX}`);
    await writeFile(abandoned, "partial");
    await utimes(abandoned, new Date(0), new Date(0));
    await writeFile(join(cache, `active${ATOMIC_TMP_SUFFIX}`), "writing");
    const preview = createOfficePreview(cache, {
      version: async () => "v1",
      convert: async () => ({
        pdf: Buffer.from("%PDF-new"),
        pageCount: 1,
        version: "v1",
      }),
    });
    await preview.preview(Buffer.from("office"), "pptx", "en");
    const entries = await readdir(cache);
    expect(entries).not.toContain("expired.pdf");
    expect(entries).not.toContain("expired.json");
    expect(entries).not.toContain("oldest.pdf");
    expect(entries).not.toContain("oldest.json");
    expect(entries).not.toContain(`abandoned${ATOMIC_TMP_SUFFIX}`);
    expect(entries).toContain("newest.pdf");
    expect(entries).toContain(`active${ATOMIC_TMP_SUFFIX}`);
    expect(entries.filter((name) => name.endsWith(".pdf"))).toHaveLength(2);
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
});
