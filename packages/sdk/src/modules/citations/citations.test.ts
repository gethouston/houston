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

  it("flags comments on pages a rewrite removed, and unflags them", () => {
    const { sdk } = makeSdk();
    sdk.citations.add("chat-a", areaOnSlide5);
    sdk.citations.reconcile("chat-a", "decks/propuesta.pptx", 4);
    expect(sdk.citations.list("chat-a")[0]?.detached).toBe(true);
    sdk.citations.reconcile("chat-a", "decks/propuesta.pptx", 8);
    expect(sdk.citations.list("chat-a")[0]?.detached).toBe(false);
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
    expect(sent.ids).toEqual([one.citation.id, two.citation.id]);
    expect(sent.text).toContain(
      `File: decks/propuesta.pptx\n1. Slide 3 of 8, selected text "El problema": Shorter title\n   Crop: ${crop1}\n2. Slide 5 of 8, area at x 12%, y 30%, 40% wide, 36% tall: (no comment)\n   Crop: ${crop2}]`,
    );
    expect(decodeCitationsEnvelopes(sent.text)).toEqual({
      text: "Fix these",
      citations: [
        {
          n: 1,
          fileName: "propuesta.pptx",
          page: 3,
          kind: "text",
          quote: "El problema",
          comment: "Shorter title",
          cropPath: crop1,
        },
        {
          n: 2,
          fileName: "propuesta.pptx",
          page: 5,
          kind: "area",
          comment: "",
          cropPath: crop2,
        },
      ],
    });
  });

  it("leaves text alone and uploads nothing for an empty draft", async () => {
    const { sdk, fetchImpl } = makeSdk();
    const sent = await sdk.citations.compose({
      agentId: "agent-1",
      draftKey: "chat-a",
      text: "hi",
    });
    expect(sent).toEqual({ text: "hi", ids: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("clears only the comments a send carried", () => {
    const { sdk } = makeSdk();
    const sent = sdk.citations.add("chat-a", textOnSlide3);
    const late = sdk.citations.add("chat-a", areaOnSlide5);
    if (!sent.ok || !late.ok) throw new Error("add refused");
    sdk.citations.clear("chat-a", [sent.citation.id]);
    expect(sdk.citations.list("chat-a").map((c) => c.id)).toEqual([
      late.citation.id,
    ]);
  });
});
