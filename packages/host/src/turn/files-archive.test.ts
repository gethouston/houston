import { unzipSync } from "fflate";
import { expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import { archiveWorkspace } from "./files-archive";
import { FileOpError } from "./files-ops";

/**
 * "Download all" — one zip of the agent's visible files. Must mirror the
 * listing's visibility rules exactly: what the Files tab shows is what the
 * archive holds, nothing more (no internal state) and nothing less.
 */

const ROOT = "ws/w1/agent-1/workspace";

test("zips the visible files round-trip, hiding internals and .keep markers", async () => {
  const vfs = new MemoryVfs();
  await vfs.writeText(`${ROOT}/report.md`, "# Q3");
  await vfs.writeBytes(`${ROOT}/Decks/deck.pptx`, Buffer.from([1, 2, 3]));
  await vfs.writeText(`${ROOT}/Empty/.keep`, "");
  await vfs.writeText(`${ROOT}/.houston/activity/activity.json`, "[]");
  await vfs.writeText(`${ROOT}/.attachments/scope/secret.txt`, "s");

  const zip = await archiveWorkspace(vfs, ROOT);
  const entries = unzipSync(new Uint8Array(zip));
  expect(Object.keys(entries).sort()).toEqual(["Decks/deck.pptx", "report.md"]);
  expect(Buffer.from(entries["report.md"] ?? []).toString()).toBe("# Q3");
  expect([...(entries["Decks/deck.pptx"] ?? [])]).toEqual([1, 2, 3]);
});

test("an empty workspace answers 404, not an empty zip", async () => {
  const vfs = new MemoryVfs();
  await vfs.writeText(`${ROOT}/.houston/config.json`, "{}"); // internals only
  await expect(archiveWorkspace(vfs, ROOT)).rejects.toThrow(FileOpError);
  await expect(archiveWorkspace(vfs, ROOT)).rejects.toThrow(
    "no files to download",
  );
});
