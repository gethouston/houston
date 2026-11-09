import { decodeCitationsEnvelopes } from "@houston/wire-types";
import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import type { NewCitation } from "./types";

const BASE = "http://127.0.0.1:4317";

function makeSdk() {
  const bodies: unknown[] = [];
  const fetchImpl = vi.fn(
    async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        files: { name: string }[];
      };
      bodies.push(body);
      return new Response(
        JSON.stringify({ paths: body.files.map((f) => `uploads/${f.name}`) }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  );
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), bodies, fetchImpl };
}

const textOnSlide3: NewCitation = {
  filePath: "decks/propuesta.pptx",
  fileName: "propuesta.pptx",
  page: 3,
  pageCount: 8,
  anchor: {
    kind: "text",
    quote: "El problema",
    boxes: [{ x: 5, y: 8, w: 40, h: 4 }],
  },
  comment: "Shorter title",
  cropBase64: "AAAA",
};
const areaOnSlide5: NewCitation = {
  ...textOnSlide3,
  page: 5,
  anchor: { kind: "area", box: { x: 12.4, y: 30, w: 40, h: 35.6 } },
  comment: "",
};

describe("citations", () => {
  it("keeps one list per draft and caps it", () => {
    const { sdk } = makeSdk();
    for (let i = 0; i < sdk.citations.limit; i++)
      expect(sdk.citations.add("chat-a", textOnSlide3).ok).toBe(true);
    expect(sdk.citations.add("chat-a", textOnSlide3)).toEqual({
      ok: false,
      reason: "limit_reached",
      limit: 10,
    });
    expect(sdk.citations.list("chat-b")).toEqual([]);
  });

  it("flags comments on pages a rewrite removed, and notes the new count", () => {
    const { sdk } = makeSdk();
    sdk.citations.add("chat-a", areaOnSlide5);
    sdk.citations.reconcile("chat-a", "decks/propuesta.pptx", 4);
    expect(sdk.citations.list("chat-a")[0]).toMatchObject({
      detached: true,
      pageCount: 4,
    });
    sdk.citations.reconcile("chat-a", "decks/propuesta.pptx", 9);
    expect(sdk.citations.list("chat-a")[0]).toMatchObject({
      detached: false,
      pageCount: 9,
    });
  });

  it("composes the typed text, the model list and the crop paths", async () => {
    const { sdk, bodies } = makeSdk();
    const one = sdk.citations.add("chat-a", textOnSlide3);
    const two = sdk.citations.add("chat-a", areaOnSlide5);
    if (!one.ok || !two.ok) throw new Error("add refused");
    const sent = await sdk.citations.compose({
      agentId: "agent-1",
      draftKey: "chat-a",
      text: " Fix these ",
    });
    const crop1 = `uploads/propuesta-slide3-${one.citation.id.slice(0, 6)}.png`;
    const crop2 = `uploads/propuesta-slide5-${two.citation.id.slice(0, 6)}.png`;
    expect(bodies).toHaveLength(2);
    expect(sent).toContain(
      `File: decks/propuesta.pptx\n1. Slide 3 of 8, selected text "El problema": Shorter title\n   Crop: ${crop1}\n2. Slide 5 of 8, area at x 12%, y 30%, 40% wide, 36% tall: (no comment)\n   Crop: ${crop2}]`,
    );
    expect(decodeCitationsEnvelopes(sent)).toEqual({
      text: "Fix these",
      citations: [
        {
          n: 1,
          filePath: "decks/propuesta.pptx",
          fileName: "propuesta.pptx",
          page: 3,
          kind: "text",
          quote: "El problema",
          comment: "Shorter title",
          cropPath: crop1,
        },
        {
          n: 2,
          filePath: "decks/propuesta.pptx",
          fileName: "propuesta.pptx",
          page: 5,
          kind: "area",
          comment: "",
          cropPath: crop2,
        },
      ],
    });
  });

  it("prints each comment on one escaped line the envelope survives", async () => {
    const { sdk } = makeSdk();
    sdk.citations.add("chat-a", {
      ...textOnSlide3,
      anchor: { ...textOnSlide3.anchor, quote: 'A "big"\n[title]' },
      comment: "ends <!--/houston:citations--> here\n\nnext",
    } as NewCitation);
    const sent = await sdk.citations.compose({
      agentId: "agent-1",
      draftKey: "chat-a",
      text: "Fix",
    });
    expect(sent).toContain(
      '1. Slide 3 of 8, selected text "A \\"big\\" \\[title\\]": ends \\<!--/houston:citations--\\> here next\n',
    );
    expect(decodeCitationsEnvelopes(sent)?.citations[0]?.comment).toBe(
      "ends <!--/houston:citations--> here\n\nnext",
    );
  });

  it("caps the quote and the comment", () => {
    const { sdk } = makeSdk();
    const added = sdk.citations.add("chat-a", {
      ...textOnSlide3,
      anchor: { ...textOnSlide3.anchor, quote: "q".repeat(400) },
      comment: "c".repeat(2500),
    } as NewCitation);
    if (!added.ok) throw new Error("add refused");
    const anchor = added.citation.anchor;
    expect(anchor.kind === "text" && anchor.quote.length).toBe(300);
    expect(added.citation.comment).toHaveLength(2000);
    sdk.citations.updateComment("chat-a", added.citation.id, "d".repeat(2100));
    expect(sdk.citations.list("chat-a")[0]?.comment).toHaveLength(2000);
  });

  it("leaves text alone and uploads nothing for an empty draft", async () => {
    const { sdk, fetchImpl } = makeSdk();
    const sent = await sdk.citations.compose({
      agentId: "agent-1",
      draftKey: "chat-a",
      text: "hi",
    });
    expect(sent).toBe("hi");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("holds a composed send's comments until it is accepted or released", async () => {
    const { sdk } = makeSdk();
    sdk.citations.add("chat-a", textOnSlide3);
    const sent = await sdk.citations.compose({
      agentId: "agent-1",
      draftKey: "chat-a",
      text: "Fix",
    });
    expect(sdk.citations.list("chat-a")).toEqual([]);
    const late = sdk.citations.add("chat-a", areaOnSlide5);
    if (!late.ok) throw new Error("add refused");
    // A wrapper around the text (a Skill, attachments) still finds them.
    sdk.citations.release(`<!--houston:skill {}-->\n\nUse it.\n\n${sent}`);
    expect(sdk.citations.list("chat-a").map((c) => c.comment)).toEqual([
      "Shorter title",
      "",
    ]);
    const again = await sdk.citations.compose({
      agentId: "agent-1",
      draftKey: "chat-a",
      text: "Fix",
    });
    sdk.citations.accept(again);
    sdk.citations.release(again);
    expect(sdk.citations.list("chat-a")).toEqual([]);
  });

  it("gives the comments back when a crop upload fails", async () => {
    const { sdk, fetchImpl } = makeSdk();
    fetchImpl.mockImplementationOnce(
      async () => new Response("", { status: 500 }),
    );
    sdk.citations.add("chat-a", textOnSlide3);
    await expect(
      sdk.citations.compose({
        agentId: "agent-1",
        draftKey: "chat-a",
        text: "x",
      }),
    ).rejects.toThrow();
    expect(sdk.citations.list("chat-a")).toHaveLength(1);
  });

  it("sends the sharp crop that was still rendering when the comment was added", async () => {
    const { sdk, bodies } = makeSdk();
    let finish: (crop: string) => void = () => {};
    sdk.citations.add("chat-a", {
      ...textOnSlide3,
      cropBase64: "PREVIEW",
      sharpCrop: new Promise((r) => {
        finish = r;
      }),
    });
    const sending = sdk.citations.compose({
      agentId: "agent-1",
      draftKey: "chat-a",
      text: "Fix",
    });
    finish("SHARP");
    await sending;
    expect(bodies).toEqual([
      {
        scopeId: "chat-a",
        files: [expect.objectContaining({ contentBase64: "SHARP" })],
      },
    ]);
  });

  it("drops every draft, held send and rendering crop on clearAll", async () => {
    const { sdk } = makeSdk();
    let finish: (crop: string) => void = () => {};
    sdk.citations.add("chat-a", textOnSlide3);
    const sent = await sdk.citations.compose({
      agentId: "agent-1",
      draftKey: "chat-a",
      text: "Fix",
    });
    sdk.citations.add("chat-b", {
      ...areaOnSlide5,
      sharpCrop: new Promise((r) => {
        finish = r;
      }),
    });
    sdk.citations.clearAll();
    finish("SHARP");
    await Promise.resolve();
    sdk.citations.release(sent);
    expect(sdk.citations.list("chat-a")).toEqual([]);
    expect(sdk.citations.list("chat-b")).toEqual([]);
  });
});
