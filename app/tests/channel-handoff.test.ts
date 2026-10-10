import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { slackHandoff } from "../src/lib/channel-handoff.ts";

const url = "https://slack.com/oauth/v2/authorize?state=abc";

describe("the browser hand-off a connect starts", () => {
  it("says nothing until a connect has run", () => {
    deepStrictEqual(slackHandoff(undefined, undefined), { kind: "idle" });
  });
  it("claims the page is open only when the browser actually opened it", () => {
    deepStrictEqual(slackHandoff({ url, opened: true }, undefined), {
      kind: "open",
    });
  });
  it("offers the page to open when the browser refused", () => {
    deepStrictEqual(slackHandoff({ url, opened: false }, undefined), {
      kind: "blocked",
      url,
    });
  });
  it("clears the refusal once the user opened it themselves", () => {
    deepStrictEqual(slackHandoff({ url, opened: false }, true), {
      kind: "open",
    });
    deepStrictEqual(slackHandoff({ url, opened: false }, false), {
      kind: "blocked",
      url,
    });
  });
});
