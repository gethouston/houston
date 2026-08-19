import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { expect, test, vi } from "vitest";
import { resolveTurnStore } from "./turn-store";
import type { TurnRequest } from "./types";

const fallback = {} as ObjectStore;
const claim = {
  id: "claim-1",
  bootId: "boot-1",
  token: "claim-token",
  heartbeatUrl: "https://gateway.test/heartbeat",
};
const turn = {
  gcsPrefix: "ws/acme/helper",
  conversationId: "conversation-1",
  hostToken: "host-token",
  claim,
} as TurnRequest;

test("a claimed pool turn gets an agent-scoped HTTP store and empty prefix", async () => {
  const seen: Array<{ url: string; headers: Headers }> = [];
  const resolved = resolveTurnStore(turn, fallback, {
    poolStoreUrl: "https://gateway.test/",
    fetchImpl: vi.fn(async (input, init) => {
      seen.push({ url: String(input), headers: new Headers(init?.headers) });
      return Response.json({ objects: [] });
    }),
  });

  expect(resolved.prefix).toBe("");
  await resolved.store.manifest?.();
  expect(seen[0]?.url).toBe(
    "https://gateway.test/v1/pod/store/acme/helper/manifest",
  );
  expect(seen[0]?.headers.get("authorization")).toBe("Bearer host-token");
});

test("ordinary turn stores keep the envelope prefix unchanged", () => {
  expect(
    resolveTurnStore({ gcsPrefix: "ws/w/a" } as TurnRequest, fallback),
  ).toEqual({ store: fallback, prefix: "ws/w/a" });
});

test.each([
  "other/acme/helper",
  "ws/acme",
  "ws/acme/helper/extra",
])("a claimed pool turn rejects malformed prefix %s", (gcsPrefix) => {
  expect(() =>
    resolveTurnStore({ ...turn, gcsPrefix }, fallback, {
      poolStoreUrl: "https://gateway.test",
    }),
  ).toThrow("gcsPrefix");
});
