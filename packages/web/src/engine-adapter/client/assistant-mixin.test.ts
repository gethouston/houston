import { describe, expect, test, vi } from "vitest";
import type { HoustonClientBase } from "./base";
import { HoustonEngineError } from "./errors";

/**
 * The assistant's address is the ONE thing the app cannot work out for itself.
 * A 200 whose body does not carry it used to be cast straight to a handle, so
 * `{}` opened a chat pane pointed at agent `undefined` and nothing said so.
 */

const { cpFetch } = vi.hoisted(() => ({ cpFetch: vi.fn() }));
vi.mock("../control-plane", () => ({ cpFetch }));

const { AssistantMixin } = await import("./assistant-mixin");

class Base {
  ctx = { prefConfig: () => ({ baseUrl: "http://gw", token: "t" }) };
}
const client = () =>
  new (AssistantMixin(Base as unknown as new () => HoustonClientBase))();

const answers = (body: unknown) =>
  cpFetch.mockResolvedValueOnce({ json: async () => body });

describe("getAssistant", () => {
  test("returns the address the host named", async () => {
    answers({ agent: "assistant-1", conversation: "c1" });

    expect(await client().getAssistant()).toEqual({
      agent: "assistant-1",
      conversation: "c1",
    });
  });

  for (const [name, body] of [
    ["an empty object", {}],
    ["a missing conversation", { agent: "assistant-1" }],
    ["a missing agent", { conversation: "c1" }],
    ["a blank id", { agent: "", conversation: "c1" }],
    ["a non-string id", { agent: 7, conversation: "c1" }],
    ["null", null],
  ] as const) {
    test(`reports ${name} instead of opening a pane at nothing`, async () => {
      answers(body);

      await expect(client().getAssistant()).rejects.toMatchObject({
        status: 502,
      });
    });
  }

  test("the failure is the loud kind, carrying the host's reason", async () => {
    answers({});
    const error = await client()
      .getAssistant()
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(HoustonEngineError);
    expect((error as HoustonEngineError).message).toContain(
      "assistant address",
    );
  });
});
