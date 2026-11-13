import { chunkContentRange, parseUploadSession } from "@houston/wire-types";
import { expect, test } from "vitest";
import { SEED_AGENT_ID } from "./config";
import { handle } from "./router";
import { resetUploads } from "./routes-uploads";
import * as state from "./state";

test("fake-host supports open, resumable sink, staged mixed commit and consumption", async () => {
  state.reset();
  resetUploads();
  const post = (path: string, body: unknown) =>
    handle(
      new Request(
        `http://host/agents/${encodeURIComponent(SEED_AGENT_ID)}/${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    );
  const opened = await post("uploads", {
    name: "file.txt",
    size: 256 * 1024 + 3,
    purpose: "attachment",
  });
  expect(opened.status).toBe(200);
  const session = parseUploadSession(await opened.json());
  if (!session) throw new Error("malformed session");
  const put = (range: string, body?: Uint8Array, no308 = true) =>
    handle(
      new Request(`http://host${session.uploadUrl}`, {
        method: "PUT",
        headers: {
          "Content-Range": range,
          ...(no308 ? { "X-GUploader-No-308": "yes" } : {}),
        },
        body: body ? new Uint8Array(body) : undefined,
      }),
    );
  const first = await put(
    chunkContentRange(0, 256 * 1024, 256 * 1024 + 3),
    new Uint8Array(256 * 1024).fill(65),
  );
  expect(first.status).toBe(200);
  expect(first.headers.get("x-http-status-code-override")).toBe("308");
  const query = await put(`bytes */${256 * 1024 + 3}`, undefined, false);
  expect(query.status).toBe(308);
  expect(query.headers.get("range")).toBe(`bytes=0-${256 * 1024 - 1}`);
  const early = await post("attachments", {
    files: [{ name: "file.txt", uploadId: session.uploadId }],
  });
  expect(early.status).toBe(409);
  const wrongPurpose = await post("files/import", {
    files: [{ name: "file.txt", uploadId: session.uploadId }],
  });
  expect(wrongPurpose.status).toBe(404);
  const last = await put(
    chunkContentRange(256 * 1024, 256 * 1024 + 3, 256 * 1024 + 3),
    new Uint8Array([66, 67, 68]),
  );
  expect(last.headers.get("x-http-status-code-override")).toBeNull();
  expect(await last.json()).toEqual({
    uploadId: session.uploadId,
    size: 256 * 1024 + 3,
  });
  const committed = await post("attachments", {
    files: [
      { name: "file.txt", uploadId: session.uploadId },
      { name: "file.txt", contentBase64: "aGk=" },
    ],
  });
  expect(committed.status).toBe(200);
  expect(await committed.json()).toEqual({
    paths: ["uploads/file.txt", "uploads/file (1).txt"],
  });
  expect(
    state.readWorkspaceFile(SEED_AGENT_ID, "uploads/file.txt")?.bytes.length,
  ).toBe(256 * 1024 + 3);
  expect((await put(`bytes */${256 * 1024 + 3}`)).status).toBe(404);
});
