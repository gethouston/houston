import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { HoustonSdk, type SdkPorts } from "@houston/sdk";
import { decodeCitedMessage } from "@houston-ai/chat";
import { submitWithCitations } from "../src/components/file-preview/cited-submit.ts";

// The chat composer's submit: file comments fold into the text before the
// Skill's own send sees it, and leave the draft only for good once the engine
// accepts that send (the adapter's `accept`, keyed by the prompt it sent).

const memory = () => {
  const map = new Map<string, string>();
  return {
    get: (k: string) => map.get(k) ?? null,
    set: (k: string, v: string) => void map.set(k, v),
    remove: (k: string) => void map.delete(k),
  };
};

function citedSdk() {
  const ports = {
    fetch: (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        files: { name: string }[];
      };
      return new Response(
        JSON.stringify({ paths: body.files.map((f) => `uploads/${f.name}`) }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch,
    storage: memory(),
    devicePreferences: memory(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  } as unknown as SdkPorts;
  const sdk = new HoustonSdk({
    baseUrl: "http://host",
    ports,
    reactivity: false,
  });
  sdk.citations.add("chat-a", {
    filePath: "deck.pptx",
    fileName: "deck.pptx",
    page: 2,
    pageCount: 4,
    anchor: { kind: "area", box: { x: 1, y: 1, w: 10, h: 10 } },
    comment: "Brand green",
    cropBase64: "iVBO",
  });
  const prepare = async (text: string) => {
    const cited = await sdk.citations.compose({
      agentId: "agent-1",
      draftKey: "chat-a",
      text,
    });
    return { text: cited, onUnsent: () => sdk.citations.release(cited) };
  };
  const comments = () => sdk.citations.list("chat-a").map((c) => c.comment);
  return { sdk, prepare, comments };
}

/** A Skill send as the chat's Skill submit builds it, recorded. */
function skillSend(sent: string[]) {
  return async ({ text }: { text: string }) => {
    const marker = JSON.stringify({ skill: "polish", message: text });
    sent.push(
      `<!--houston:skill ${marker}-->\n\nUse the polish skill.\n\n${text}`,
    );
    return true as const;
  };
}

describe("composer submit with file comments", () => {
  it("a Skill send carries the comments, and they clear only on acceptance", async () => {
    const { sdk, prepare, comments } = citedSdk();
    const sent: string[] = [];
    const outcome = await submitWithCitations(
      { text: "Polish it" },
      prepare,
      skillSend(sent),
    );
    assert.equal(outcome, true);
    assert.deepEqual(
      decodeCitedMessage(sent[0] ?? "")?.citations.map((c) => c.comment),
      ["Brand green"],
    );
    // Out with the send: not in the draft, not yet gone.
    assert.deepEqual(comments(), []);
    sdk.citations.release(sent[0] ?? "");
    assert.deepEqual(comments(), ["Brand green"]);

    await submitWithCitations({ text: "Again" }, prepare, skillSend(sent));
    sdk.citations.accept(sent[1] ?? "");
    sdk.citations.release(sent[1] ?? "");
    assert.deepEqual(comments(), []);
  });

  it("a Skill send that throws gives the comments back", async () => {
    const { prepare, comments } = citedSdk();
    await assert.rejects(
      submitWithCitations({ text: "Polish it" }, prepare, async () => {
        throw new Error("offline");
      }),
    );
    assert.deepEqual(comments(), ["Brand green"]);
  });

  it("without a Skill, hands the board the folded text to route", async () => {
    const { prepare } = citedSdk();
    const outcome = await submitWithCitations(
      { text: "Fix" },
      prepare,
      () => false,
    );
    assert.ok(typeof outcome === "object");
    assert.equal(decodeCitedMessage(outcome.text)?.text, "Fix");
  });
});
