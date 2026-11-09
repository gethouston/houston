import { HoustonClient } from "@houston/engine-adapter/client";
import { disposeAllStreams } from "@houston/engine-adapter/turn-stream";
import { conversationStore, conversationVm } from "@houston/engine-adapter/vm";
import { conversationScope } from "@houston/sdk";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  type Call,
  createWireCapture,
  installLocalStorage,
  json,
} from "./support/wire-capture";

/**
 * File comments folded into a send leave the composer while it is out, and
 * are dropped for good only once the engine accepts it. The host's verdict
 * lands after `startSession` returned, so each case holds the POST open and
 * answers it later.
 */

const AGENT = "a1";
const { stubRouted, restore, reset } = createWireCapture();

let answer: (res: Response) => void;
let posted: Promise<void>;

beforeEach(() => {
  installLocalStorage();
  reset();
  let notePosted = () => {};
  posted = new Promise((r) => {
    notePosted = r;
  });
  const verdict = new Promise<Response>((r) => {
    answer = r;
  });
  stubRouted((call: Call) => {
    if (call.url.endsWith("/attachments"))
      return json(200, { paths: ["uploads/deck-slide3-x.png"] });
    if (call.url.endsWith("/events"))
      // Open until the client aborts it, as a real event stream is.
      return new Response(
        new ReadableStream({
          start(controller) {
            call.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("aborted", "AbortError")),
            );
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    if (call.method === "POST" && call.url.endsWith("/messages")) {
      notePosted();
      return verdict;
    }
    return json(200, { ok: true, items: [], messages: [] });
  });
});

afterEach(() => {
  disposeAllStreams();
  restore();
});

function setup(draftKey: string) {
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  const citations = client.engineSdk.citations;
  const added = citations.add(draftKey, {
    filePath: "deck.pptx",
    fileName: "deck.pptx",
    page: 3,
    pageCount: 8,
    anchor: { kind: "area", box: { x: 10, y: 20, w: 30, h: 40 } },
    comment: "Brand green",
    cropBase64: "iVBO",
  });
  if (!added.ok) throw new Error("add refused");
  const comments = () => citations.list(draftKey).map((c) => c.comment);
  /** Resolves on the draft's next published list. */
  const nextList = () =>
    new Promise<string[]>((resolve) => {
      const off = client.engineSdk.subscribe(citations.scope(draftKey), () => {
        off();
        resolve(comments());
      });
    });
  return { client, comments, nextList };
}

test("a send the engine refuses after startSession returned gives the comments back", async () => {
  const { client, comments, nextList } = setup("activity-refused");
  const prompt = await client.composeCitations(
    AGENT,
    "activity-refused",
    "Fix",
  );
  expect(comments()).toEqual([]);

  await client.startSession(AGENT, { sessionKey: "activity-refused", prompt });
  await posted;
  expect(comments()).toEqual([]);

  const back = nextList();
  answer(json(400, { error: "message too long" }));
  expect(await back).toEqual(["Brand green"]);
});

test("an accepted send drops the comments for good", async () => {
  const { client, comments } = setup("activity-accepted");
  const citations = client.engineSdk.citations;
  const settled = (method: "accept" | "release") =>
    new Promise<void>((resolve) => {
      const original = citations[method];
      citations[method] = (prompt) => {
        original(prompt);
        resolve();
      };
    });
  const accepted = settled("accept");
  const released = settled("release");
  const prompt = await client.composeCitations(
    AGENT,
    "activity-accepted",
    "Fix",
  );
  await client.startSession(AGENT, { sessionKey: "activity-accepted", prompt });
  await posted;
  answer(json(202, { ok: true }));
  await accepted;
  // The turn then ends with no verdict (a teardown): nothing comes back.
  disposeAllStreams();
  await released;
  expect(comments()).toEqual([]);
  expect(
    await client.composeCitations(AGENT, "activity-accepted", "again"),
  ).toBe("again");
});

test("a queued send removed before it went out gives the comments back", async () => {
  const key = "activity-queued";
  const { client, comments } = setup(key);
  conversationVm.sessionStatus(AGENT, key, "running");
  const prompt = await client.composeCitations(AGENT, key, "Fix");
  await client.startSession(AGENT, { sessionKey: key, prompt });
  expect(comments()).toEqual([]);

  const queued = (
    conversationStore.getSnapshot(conversationScope(AGENT, key)) as {
      queued?: { id: string }[];
    }
  ).queued;
  client.removeQueuedMessage(AGENT, key, queued?.[0]?.id ?? "");
  expect(comments()).toEqual(["Brand green"]);
});
