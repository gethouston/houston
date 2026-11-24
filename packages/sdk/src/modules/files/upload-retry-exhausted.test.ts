import { RESUMABLE_UPLOAD_THRESHOLD_BYTES } from "@houston/wire-types";
import { describe, expect, it, vi } from "vitest";
import type { SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { isUploadInterruptedError } from "./upload-interrupted";

const SESSION = {
  uploadId: "upload_session_0001",
  uploadUrl: "/v1/sink",
  chunkBytes: 256 * 1024,
  expiresAt: "2026-11-14T00:00:00Z",
};

function makeSdk(sink: () => Promise<Response>) {
  let t = 1_000;
  const ports: SdkPorts = {
    fetch: vi.fn(async () => Response.json(SESSION)),
    rawFetch: vi.fn(async () => {
      t += 5_000;
      return sink();
    }),
    random: () => 0,
    clock: {
      now: () => 0,
      monotonic: () => t,
      setTimeout: (fn) => {
        queueMicrotask(fn);
        return 1;
      },
      clearTimeout: () => {},
    },
    storage: memoryKv(),
    devicePreferences: memoryKv(),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  return new HoustonSdk({ baseUrl: "https://host", reactivity: false, ports });
}

const attachment = () => ({
  name: "big.bin",
  blob: new Blob([new Uint8Array(RESUMABLE_UPLOAD_THRESHOLD_BYTES + 1)]),
});

describe("resumable upload — retry budget exhausted by transport drops", () => {
  it("rejects with the interrupted-upload error every surface reports quietly", async () => {
    const sdk = makeSdk(() => Promise.reject(new TypeError("Load failed")));
    const err = await sdk.files
      .saveAttachments("a1", "conv-1", [attachment()])
      .catch((e: unknown) => e);

    expect(isUploadInterruptedError(err)).toBe(true);
    expect(err).toMatchObject({
      route: "attachments",
      fileBytes: RESUMABLE_UPLOAD_THRESHOLD_BYTES + 1,
      elapsedMs: 25 * 5_000,
    });
    expect((err as Error).message).toContain("Load failed");
  });

  it("keeps a sink that answers 5xx until exhaustion a bug", async () => {
    const sdk = makeSdk(async () => new Response(null, { status: 503 }));
    const err = await sdk.files
      .saveAttachments("a1", "conv-1", [attachment()])
      .catch((e: unknown) => e);

    expect(isUploadInterruptedError(err)).toBe(false);
    expect(err).toMatchObject({
      name: "UploadTransferError",
      message: "Upload retry budget exhausted",
    });
  });
});
