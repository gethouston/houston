import { describe, expect, it } from "vitest";
import { resolveFakeHostPort } from "./config";

describe("resolveFakeHostPort", () => {
  it("uses the default base port outside a Playwright worker", () => {
    expect(resolveFakeHostPort({})).toBe(4399);
  });

  it("honors the per-worktree base-port override", () => {
    expect(resolveFakeHostPort({ HOUSTON_E2E_FAKE_HOST_PORT: "4460" })).toBe(
      4460,
    );
  });

  it("gives each Playwright parallel slot its own port above the base", () => {
    expect(resolveFakeHostPort({ TEST_PARALLEL_INDEX: "0" })).toBe(4400);
    expect(resolveFakeHostPort({ TEST_PARALLEL_INDEX: "3" })).toBe(4403);
  });

  it("stacks the slot offset on top of a base-port override", () => {
    expect(
      resolveFakeHostPort({
        HOUSTON_E2E_FAKE_HOST_PORT: "4460",
        TEST_PARALLEL_INDEX: "2",
      }),
    ).toBe(4463);
  });
});
