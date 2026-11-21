import { describe, expect, test } from "vitest";
import { BodyTooLargeError, readBody, readJson } from "./read-body";

function countingReq(
  chunkSize: number,
  chunks: number,
  headers: Record<string, string> = {},
) {
  const state = { pulled: 0 };
  const req = {
    headers,
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < chunks; i++) {
        state.pulled += chunkSize;
        yield Buffer.alloc(chunkSize, 0x61);
      }
    },
  };
  return { req: req as never, state };
}

function jsonReq(value: unknown) {
  const buf = Buffer.from(JSON.stringify(value));
  return {
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield buf;
    },
  } as never;
}

describe("readBody byte cap", () => {
  test("rejects an oversized chunked body WITHOUT draining the whole stream", async () => {
    const cap = 1024;
    const { req, state } = countingReq(1024, 100);
    await expect(readBody(req, cap)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(state.pulled).toBeLessThanOrEqual(cap + 1024);
  });

  test("a Content-Length over the cap is rejected before ANY body is read", async () => {
    const cap = 1024;
    const { req, state } = countingReq(1024, 100, {
      "content-length": String(100 * 1024),
    });
    await expect(readBody(req, cap)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(state.pulled).toBe(0);
  });

  test("a lying Content-Length under the cap is still caught by the streaming guard", async () => {
    const cap = 1024;
    const { req } = countingReq(1024, 100, { "content-length": "512" });
    await expect(readBody(req, cap)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  test("a body at/under the cap is returned in full", async () => {
    const { req } = countingReq(256, 4);
    const buf = await readBody(req, 1024);
    expect(buf.length).toBe(1024);
  });

  test("BodyTooLargeError carries the 413 status and no parser text", () => {
    const err = new BodyTooLargeError(1024);
    expect(err.status).toBe(413);
    expect(err.maxBytes).toBe(1024);
    expect(err.message).toBe("request body exceeds the size limit");
  });
});

describe("readJson byte cap", () => {
  test("parses a JSON body under the cap", async () => {
    const body = await readJson(jsonReq({ hello: "world" }), 1024);
    expect(body).toEqual({ hello: "world" });
  });

  test("an empty body reads as {}", async () => {
    const req = {
      headers: {},
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: true, value: undefined }),
      }),
    } as never;
    expect(await readJson(req)).toEqual({});
  });

  test("an oversized JSON body rejects with 413 instead of buffering + parsing it", async () => {
    const { req } = countingReq(1024, 100);
    await expect(readJson(req, 1024)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});
