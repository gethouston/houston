import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { decodeAttachmentMessage } from "@houston-ai/chat";
import {
  encodeAutoContinueMessage,
  isAutoContinueMessage,
} from "../src/lib/auto-continue-message.ts";
import {
  type InteractionReplyPorts,
  type InteractionReplySendOptions,
  sendInteractionReply,
} from "../src/lib/interaction-reply-send.ts";

const PIN = { provider: "anthropic", model: "claude-sonnet" };

function ports(over: Partial<InteractionReplyPorts> = {}) {
  const log = {
    saved: [] as string[][],
    sent: [] as { prompt: string; opts: InteractionReplySendOptions }[],
    failed: [] as unknown[],
    reported: [] as unknown[],
    onSent: [] as string[][],
  };
  const p: InteractionReplyPorts = {
    resolvePin: () => Promise.resolve(PIN),
    save: (files) => {
      log.saved.push(files.map((f) => f.name));
      return Promise.resolve(files.map((f) => `uploads/${f.name}`));
    },
    send: (prompt, opts) => {
      log.sent.push({ prompt, opts });
      return Promise.resolve("turn");
    },
    onSent: (files) => log.onSent.push(files.map((f) => f.name)),
    onFailed: (err) => log.failed.push(err),
    onSentThrew: (err) => log.reported.push(err),
    ...over,
  };
  return { p, log };
}

const fox = new File(["png"], "fox.png", { type: "image/png" });

describe("sendInteractionReply", () => {
  it("sends the answer with its files and reports it accepted", async () => {
    const { p, log } = ports();
    const ok = await sendInteractionReply(
      { text: "Pick one: The fox", mode: "execute", files: [fox] },
      p,
    );
    strictEqual(ok, true);
    deepStrictEqual(log.saved, [["fox.png"]]);
    strictEqual(log.sent.length, 1);
    deepStrictEqual(decodeAttachmentMessage(log.sent[0].prompt), {
      message: "Pick one: The fox",
      files: [{ path: "uploads/fox.png", name: "fox.png" }],
    });
    deepStrictEqual(log.sent[0].opts, {
      providerOverride: "anthropic",
      modelOverride: "claude-sonnet",
      effortOverride: undefined,
      modeOverride: "execute",
      queuedPreview: {
        text: "Pick one: The fox",
        attachmentNames: ["fox.png"],
      },
    });
    deepStrictEqual(log.onSent, [["fox.png"]]);
  });

  it("reports a failed upload as not accepted, without sending or rejecting", async () => {
    const boom = new Error("upload interrupted");
    const { p, log } = ports({ save: () => Promise.reject(boom) });
    const ok = await sendInteractionReply(
      { text: "See attached", mode: "execute", files: [fox] },
      p,
    );
    strictEqual(ok, false);
    strictEqual(log.sent.length, 0);
    deepStrictEqual(log.failed, [boom]);
    deepStrictEqual(log.onSent, []);
  });

  it("reports a refused send as not accepted", async () => {
    const refused = new Error("409");
    const { p, log } = ports({ send: () => Promise.reject(refused) });
    const ok = await sendInteractionReply(
      { text: "See attached", mode: "plan", files: [fox] },
      p,
    );
    strictEqual(ok, false);
    deepStrictEqual(log.failed, [refused]);
  });

  it("keeps an accepted send accepted when the hand-off after it throws", async () => {
    const thrown = new Error("nav");
    const { p, log } = ports({
      onSent: () => {
        throw thrown;
      },
    });
    const ok = await sendInteractionReply(
      { text: "The fox", mode: "execute", files: [] },
      p,
    );
    strictEqual(ok, true);
    deepStrictEqual(log.failed, []);
    deepStrictEqual(log.reported, [thrown]);
  });

  it("sends a connect-only reply verbatim, so it stays a hidden auto-continue", async () => {
    const text = encodeAutoContinueMessage(
      "I connected Gmail. Please continue.",
    );
    const { p, log } = ports();
    const ok = await sendInteractionReply(
      { text, mode: "execute", files: [] },
      p,
    );
    strictEqual(ok, true);
    deepStrictEqual(log.saved, []);
    strictEqual(log.sent[0].prompt, text);
    strictEqual(isAutoContinueMessage(log.sent[0].prompt), true);
  });
});
