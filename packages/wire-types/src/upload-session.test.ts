import { describe, expect, it } from "vitest";
import {
  chunkContentRange,
  committedUploadFileSchema,
  openUploadRequestSchema,
  parseUploadRefusal,
  parseUploadSession,
  persistedBytesFromRange,
  statusQueryContentRange,
} from "./upload-session";

const MiB = 1024 * 1024;

describe("upload sessions", () => {
  it("reads a session the gateway or host answers", () => {
    const session = {
      uploadId: "01JD3Q9ZK7Y4M2N8P6R5T0VWXS",
      uploadUrl:
        "https://storage.googleapis.com/upload/storage/v1/b/x/o?upload_id=abc",
      chunkBytes: 8 * MiB,
      expiresAt: "2026-11-14T12:00:00Z",
    };
    expect(parseUploadSession(session)).toEqual(session);
    expect(
      parseUploadSession({ ...session, uploadUrl: "/v1/uploads/abc" }),
    ).not.toBeNull();
  });

  it("refuses a chunk size storage would reject", () => {
    expect(
      parseUploadSession({
        uploadId: "01JD3Q9ZK7Y4M2N8P6R5T0VWXS",
        uploadUrl: "/v1/uploads/x",
        chunkBytes: 8 * MiB + 1,
        expiresAt: "2026-11-14T12:00:00Z",
      }),
    ).toBeNull();
  });

  it("caps an open request at 100 MiB and refuses an id that could escape a key", () => {
    expect(
      openUploadRequestSchema.safeParse({
        name: "a.pdf",
        size: 100 * MiB,
        purpose: "attachment",
      }).success,
    ).toBe(true);
    expect(
      openUploadRequestSchema.safeParse({
        name: "a.pdf",
        size: 100 * MiB + 1,
        purpose: "attachment",
      }).success,
    ).toBe(false);
    expect(
      committedUploadFileSchema.safeParse({
        name: "a.pdf",
        uploadId: "../../ws/other/agent",
      }).success,
    ).toBe(false);
  });

  it("frames chunk and status-query ranges the storage way", () => {
    expect(chunkContentRange(0, 8 * MiB, 90 * MiB)).toBe(
      `bytes 0-${8 * MiB - 1}/${90 * MiB}`,
    );
    expect(statusQueryContentRange(42)).toBe("bytes */42");
  });

  it("reads persisted bytes off a Range header", () => {
    expect(persistedBytesFromRange(null)).toBe(0);
    expect(persistedBytesFromRange("bytes=0-262143")).toBe(262144);
    expect(persistedBytesFromRange("bytes=5-9")).toBeNull();
  });

  it("reads a coded refusal and nothing else", () => {
    expect(
      parseUploadRefusal({ error: "too big", code: "upload_too_large" }),
    ).toEqual({
      error: "too big",
      code: "upload_too_large",
    });
    expect(parseUploadRefusal({ error: "nope" })).toBeNull();
  });
});
