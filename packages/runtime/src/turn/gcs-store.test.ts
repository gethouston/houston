import type { Storage } from "@google-cloud/storage";
import { expect, test, vi } from "vitest";
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
  // SAFETY: this manifest test exercises only Storage.bucket().getFiles(),
  // and the fixture supplies that exact external-client seam.
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
