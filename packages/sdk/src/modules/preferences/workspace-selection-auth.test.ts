import { EngineError } from "@houston/runtime-client";
import { expect, it, vi } from "vitest";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { createAuthFetch } from "../session/auth-fetch";

it("a 401 selection read stays unwrapped and emits the existing token-expiry signal", async () => {
  const storage = memoryKv();
  const sdk = new HoustonSdk({
    baseUrl: "http://host",
    reactivity: false,
    ports: {
      fetch: createAuthFetch(
        async () => Response.json({ error: "signed_out" }, { status: 401 }),
        storage,
      ),
      storage,
      devicePreferences: memoryKv(),
      clock: { now: Date.now, setTimeout: () => 0, clearTimeout: () => {} },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    },
  });
  const events: string[] = [];
  sdk.on((event) => events.push(event.type));
  await sdk.session.setToken("expired-token");
  const error = await sdk.preferences
    .get("last_workspace_id")
    .catch((error) => error);
  expect(error).toBeInstanceOf(EngineError);
  expect(error.status).toBe(401);
  expect(events.filter((type) => type === "session/tokenExpired")).toHaveLength(
    1,
  );
});
