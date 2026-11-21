import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import {
  FilesHttpError,
  isUploadInterruptedError,
  UploadInterruptedError,
} from "./index";

const BASE = "http://127.0.0.1:4317";
const FRAMES = [
  { name: "a.txt", contentBase64: "YWJjZGVm", relPath: undefined },
];

function makeSdk(outcome: () => Promise<Response>) {
  let t = 1_000;
  const ports: SdkPorts = {
    fetch: vi.fn(async () => {
      t += 60_000;
      return outcome();
    }) as unknown as typeof fetch,
    storage: memoryKv(),
    devicePreferences: memoryKv(),
    clock: {
      now: () => 0,
      monotonic: () => t,
      setTimeout: () => 0,
      clearTimeout: () => {},
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return new HoustonSdk(config);
}

const dropped = () => Promise.reject(new TypeError("Failed to fetch"));

describe("files module — an upload the transport cut", () => {
  it("types a composer attachment cut mid-flight", async () => {
    const err = await makeSdk(dropped)
      .files.saveAttachments("a1", "conv-1", FRAMES)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UploadInterruptedError);
    expect(isUploadInterruptedError(err)).toBe(true);
    const cut = err as UploadInterruptedError;
    expect(cut.route).toBe("attachments");
    expect(cut.elapsedMs).toBe(60_000);
    expect(cut.fileBytes).toBe(6);
    expect(cut.message).toContain("Failed to fetch");
    expect(cut.cause).toBeUndefined();
  });

  it("types a Files-section import cut mid-flight", async () => {
    const err = await makeSdk(dropped)
      .files.uploadProjectFiles("a1", FRAMES, "docs")
      .catch((e: unknown) => e);

    expect(isUploadInterruptedError(err)).toBe(true);
    expect((err as UploadInterruptedError).route).toBe("files_import");
  });

  it("leaves an HTTP answer and an abort as they were", async () => {
    const answered = await makeSdk(
      async () => new Response("boom", { status: 500 }),
    )
      .files.saveAttachments("a1", "conv-1", FRAMES)
      .catch((e: unknown) => e);
    expect(answered).toBeInstanceOf(FilesHttpError);

    const abort = new DOMException("The operation was aborted.", "AbortError");
    const aborted = await makeSdk(() => Promise.reject(abort))
      .files.saveAttachments("a1", "conv-1", FRAMES)
      .catch((e: unknown) => e);
    expect(aborted).toBe(abort);
  });

  it("leaves a coding-bug TypeError a bug", async () => {
    const bug = new TypeError("x is not a function");
    const err = await makeSdk(() => Promise.reject(bug))
      .files.saveAttachments("a1", "conv-1", FRAMES)
      .catch((e: unknown) => e);
    expect(err).toBe(bug);
  });

  it("recognizes the error by name, so a minified bundle still matches", () => {
    const renamed = new Error("x");
    renamed.name = "UploadInterruptedError";
    expect(isUploadInterruptedError(renamed)).toBe(true);
    expect(isUploadInterruptedError(new TypeError("Failed to fetch"))).toBe(
      false,
    );
  });
});
