import { completeSimple, getModel } from "@earendil-works/pi-ai/compat";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

/**
 * Gemini 3.7 Flash and later reject `thinkingLevel: MINIMAL` with a 400, and
 * a call that carries no reasoning level (the key-verify probe, one-shot
 * helpers) or asks for `minimal` must still go out as LOW on 3.7+ Flash only;
 * the older Flash rows and Flash-Lite keep MINIMAL, which they accept. pi
 * floors these itself now, and this guards that on every pi bump.
 *
 * The request is captured off the global `fetch`, which the Google adapter
 * uses when the call passes none. A 400 reply is enough: only the outgoing
 * body matters.
 */
type Captured = { thinkingLevel?: string; includeThoughts?: boolean };

let captured: Captured | undefined;
const realFetch = globalThis.fetch;

beforeEach(() => {
  captured = undefined;
  globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      generationConfig?: { thinkingConfig?: Captured };
    };
    captured = body.generationConfig?.thinkingConfig;
    return new Response(
      JSON.stringify({
        error: { code: 400, message: "captured", status: "INVALID_ARGUMENT" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function probe(modelId: string, reasoning?: "minimal" | "low") {
  const model = getModel("google", modelId as never);
  expect(model, `${modelId} must be in pi's google catalog`).toBeDefined();
  if (!model) throw new Error("unreachable");
  await completeSimple(
    model,
    { messages: [{ role: "user", content: "ping", timestamp: Date.now() }] },
    {
      apiKey: "test-key",
      maxTokens: 1,
      ...(reasoning ? { reasoning } : {}),
    },
  );
  expect(captured, "request must carry a thinkingConfig").toBeDefined();
  return captured as Captured;
}

test("3.8 Flash with no reasoning level floors at LOW, not MINIMAL", async () => {
  expect((await probe("gemini-3.8-flash")).thinkingLevel).toBe("LOW");
});

test("3.7 Flash with no reasoning level floors at LOW, not MINIMAL", async () => {
  expect((await probe("gemini-3.7-flash")).thinkingLevel).toBe("LOW");
});

test("3.8 Flash asked for minimal is lifted to LOW", async () => {
  expect((await probe("gemini-3.8-flash", "minimal")).thinkingLevel).toBe(
    "LOW",
  );
});

test("3.8 Flash asked for low still sends LOW", async () => {
  expect((await probe("gemini-3.8-flash", "low")).thinkingLevel).toBe("LOW");
});

test("3.6 Flash keeps pi's MINIMAL floor (Google accepts it there)", async () => {
  expect((await probe("gemini-3.6-flash")).thinkingLevel).toBe("MINIMAL");
});
