import { expect, test } from "vitest";
import type { ModuleContext } from "../../module-context";
import { FilesHttpError } from "../files/http";
import {
  AttachmentTooLargeError,
  asAttachmentsSaveInput,
  createAttachmentsOperation,
} from "./attachments";

/**
 * The attachments save operation: it hands the files to the files module's
 * upload request — one wire body, one owner — so the POST lands on the agent's
 * `attachments` route with `relPath` intact, and surfaces a 413 as a typed
 * too-large error. No silent failures.
 */

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

/** A ModuleContext whose `ports.fetch` is a scripted stub recording each call. */
function ctxWith(
  responder: (call: FetchCall) => Response,
  baseUrl = "http://host.test",
): { ctx: ModuleContext; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return responder(call);
  }) as unknown as typeof fetch;
  const ctx = {
    config: { baseUrl, ports: { fetch: fetchImpl } },
    authExpiry: { notifyExpired: () => {} },
  } as unknown as ModuleContext;
  return { ctx, calls };
}

const okPaths = (paths: string[]) =>
  new Response(JSON.stringify({ paths }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

test("posts to the per-agent attachments route and returns the paths", async () => {
  const { ctx, calls } = ctxWith(() => okPaths(["uploads/a.pdf"]));
  const op = createAttachmentsOperation(ctx);

  const out = await op.save({
    agentId: "ag 1",
    scopeId: "conv-9",
    files: [{ name: "a.pdf", contentBase64: "QQ==" }],
  });

  expect(out).toEqual({ paths: ["uploads/a.pdf"] });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("http://host.test/agents/ag%201/attachments");
  expect(calls[0].init?.method).toBe("POST");
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({
    scopeId: "conv-9",
    files: [{ name: "a.pdf", contentBase64: "QQ==" }],
  });
});

test("forwards relPath, so a dropped folder keeps its nesting", async () => {
  const { ctx, calls } = ctxWith(() => okPaths(["uploads/deck/a.png"]));
  await createAttachmentsOperation(ctx).save({
    agentId: "a1",
    scopeId: "s",
    files: [{ name: "a.png", contentBase64: "QQ==", relPath: "deck/a.png" }],
  });
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({
    scopeId: "s",
    files: [{ name: "a.png", contentBase64: "QQ==", relPath: "deck/a.png" }],
  });
});

test("a 413 surfaces as a typed AttachmentTooLargeError with status 413", async () => {
  const { ctx } = ctxWith(
    () => new Response(JSON.stringify({ error: "too big" }), { status: 413 }),
  );
  const op = createAttachmentsOperation(ctx);
  const err = await op
    .save({
      agentId: "a1",
      scopeId: "s",
      files: [{ name: "a", contentBase64: "x" }],
    })
    .catch((e) => e);
  expect(err).toBeInstanceOf(AttachmentTooLargeError);
  expect((err as AttachmentTooLargeError).status).toBe(413);
});

test("a non-413 failure throws with the status and body (no silent failure)", async () => {
  const { ctx } = ctxWith(() => new Response("boom", { status: 500 }));
  const err = await createAttachmentsOperation(ctx)
    .save({
      agentId: "a1",
      scopeId: "s",
      files: [{ name: "a", contentBase64: "x" }],
    })
    .catch((e) => e);
  expect(err).toBeInstanceOf(FilesHttpError);
  expect(err.status).toBe(500);
  expect(err.message).toBe("boom");
});

test("a malformed 200 body throws rather than returning junk", async () => {
  const { ctx } = ctxWith(
    () =>
      new Response(JSON.stringify({ paths: [1, 2] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  await expect(
    createAttachmentsOperation(ctx).save({
      agentId: "a1",
      scopeId: "s",
      files: [{ name: "a", contentBase64: "x" }],
    }),
  ).rejects.toThrow(/malformed response/);
});

test("asAttachmentsSaveInput validates the untrusted envelope", () => {
  expect(() => asAttachmentsSaveInput({ files: [] })).toThrow(/agentId/);
  expect(() => asAttachmentsSaveInput({ agentId: "ag", files: [] })).toThrow(
    /scopeId/,
  );
  expect(() =>
    asAttachmentsSaveInput({ agentId: "ag", scopeId: "s", files: [] }),
  ).toThrow(/non-empty files/);
  expect(() =>
    asAttachmentsSaveInput({
      agentId: "ag",
      scopeId: "s",
      files: [{ name: "", contentBase64: "x" }],
    }),
  ).toThrow(/non-empty string name/);
  expect(() =>
    asAttachmentsSaveInput({
      agentId: "ag",
      scopeId: "s",
      files: [{ name: "a", contentBase64: 5 }],
    }),
  ).toThrow(/string contentBase64/);
  expect(
    asAttachmentsSaveInput({
      scopeId: "s",
      agentId: "ag",
      files: [{ name: "a.pdf", contentBase64: "QQ==", relPath: "d/a.pdf" }],
    }),
  ).toEqual({
    scopeId: "s",
    agentId: "ag",
    files: [{ name: "a.pdf", contentBase64: "QQ==", relPath: "d/a.pdf" }],
  });
});
