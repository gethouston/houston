import { expect, test, vi } from "vitest";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";

test("the typed facade and commands share a default-on per-user preference", async () => {
  let value: string | null = null;
  const writes: string[] = [];
  const sdk = new HoustonSdk({
    baseUrl: "http://host",
    reactivity: false,
    ports: {
      fetch: async (_url, init) => {
        if (init?.method === "PUT") {
          writes.push(String(init.body));
          value = String(JSON.parse(String(init.body)).value);
        }
        return Response.json({ value });
      },
      storage: memoryKv(),
      devicePreferences: memoryKv(),
      clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    },
  });
  expect(await sdk.preferences.getNextStepSuggestions()).toBe(true);
  expect(
    await sdk.dispatch({
      id: "off",
      type: "preferences/setNextStepSuggestions",
      payload: { value: "false" },
    }),
  ).toMatchObject({ ok: true, value: false });
  expect(await sdk.preferences.getNextStepSuggestions()).toBe(false);
  expect(await sdk.preferences.setNextStepSuggestions("true")).toBe(true);
  expect(writes).toEqual(['{"value":"false"}', '{"value":"true"}']);
  expect(
    await sdk.dispatch({
      id: "bad",
      type: "preferences/setNextStepSuggestions",
      payload: { value: false },
    }),
  ).toMatchObject({ ok: false });
  sdk.dispose();
});
