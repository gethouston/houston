import { execFileSync } from "node:child_process";
import {
  chmodSync,
  createReadStream,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGunzip } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { listTarEntries } from "./tar-entries.mjs";

const root = mkdtempSync(join(tmpdir(), "tar-entries-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const archive = (name, extra = () => {}) => {
  const dir = join(root, name);
  const app = join(dir, "X.app");
  const deep = `Contents/Resources/${"nested-directory-name/".repeat(6)}`;
  mkdirSync(join(app, "Contents/MacOS"), { recursive: true });
  mkdirSync(join(app, deep), { recursive: true });
  writeFileSync(join(app, "Contents/Info.plist"), "<plist/>");
  writeFileSync(join(app, "Contents/MacOS/x"), "#!/bin/sh\n");
  chmodSync(join(app, "Contents/MacOS/x"), 0o755);
  writeFileSync(join(app, deep, "long-file-name.json"), "{}");
  symlinkSync("MacOS/x", join(app, "Contents/link"));
  extra(app);
  const out = join(root, `${name}.tar.gz`);
  execFileSync("tar", ["-czf", out, "-C", dir, "X.app"], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  return listTarEntries(createReadStream(out).pipe(createGunzip()));
};

describe("listTarEntries", () => {
  it("lists type, mode, full path and link target of every entry", async () => {
    const entries = await archive("plain");
    const deepFile = `X.app/Contents/Resources/${"nested-directory-name/".repeat(6)}long-file-name.json`;
    expect(deepFile.length).toBeGreaterThan(100);
    expect(entries).toContain("dir\t0755\tX.app\t");
    expect(entries).toContain("file\t0755\tX.app/Contents/MacOS/x\t");
    expect(entries).toContain("file\t0644\tX.app/Contents/Info.plist\t");
    expect(entries).toContainEqual(
      expect.stringMatching(
        /^symlink\t\d{4}\tX\.app\/Contents\/link\tMacOS\/x$/,
      ),
    );
    expect(entries).toContain(`file\t0644\t${deepFile}\t`);
    expect(entries).toEqual([...entries].sort());
    expect(entries.some((entry) => entry.startsWith("hardlink"))).toBe(false);
  });

  it("reports a multiply-linked file as a hardlink entry", async () => {
    const plain = await archive("plain-again");
    const entries = await archive("hardlinked", (app) =>
      linkSync(join(app, "Contents/Info.plist"), join(app, "Contents/copy")),
    );
    const hardlinks = entries.filter((entry) => entry.startsWith("hardlink"));
    expect(hardlinks).toHaveLength(1);
    expect(hardlinks[0]).toMatch(/\tX\.app\/Contents\/(copy|Info\.plist)$/);
    expect(entries).toHaveLength(plain.length + 1);
  });
});
