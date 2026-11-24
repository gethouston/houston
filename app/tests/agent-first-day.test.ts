import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  firstDayAccountBlocked,
  isFirstDayNoProvider,
  isFirstDayNotPending,
  isFirstDayProviderUnavailable,
} from "@houston/sdk/agents/first-day-refusal";
import { isFirstDayPending } from "../src/lib/agent-first-day-model.ts";
import { classifyQuietError } from "../src/lib/quiet-error-class.ts";

describe("isFirstDayPending", () => {
  it("offers the start button only on an explicit pending", () => {
    assert.equal(isFirstDayPending({ firstDay: "pending" }), true);
  });

  it("treats a first day that ran as done", () => {
    assert.equal(isFirstDayPending({ firstDay: "started" }), false);
  });

  it("treats an employee that predates the field as done", () => {
    assert.equal(isFirstDayPending({ provider: "anthropic" }), false);
    assert.equal(isFirstDayPending({}), false);
  });

  it("shows nothing while the config is still loading", () => {
    assert.equal(isFirstDayPending(undefined), false);
  });
});

describe("isFirstDayNotPending (SDK)", () => {
  it("names the host's refusal of a start button that outlived its first day", () => {
    assert.equal(
      isFirstDayNotPending({
        status: 409,
        body: { error: "x", code: "first_day_not_pending" },
      }),
      true,
    );
  });

  it("leaves every other failure to be reported", () => {
    assert.equal(
      isFirstDayNotPending({
        status: 409,
        body: { code: "first_day_not_started" },
      }),
      false,
    );
    assert.equal(isFirstDayNotPending({ status: 409, body: {} }), false);
    assert.equal(isFirstDayNotPending(new Error("boom")), false);
    assert.equal(isFirstDayNotPending(null), false);
  });
});

describe("a start with no AI connected", () => {
  const refusal = {
    status: 409,
    body: {
      error: "No provider connected. Connect an AI provider first.",
      code: "first_day_no_provider",
    },
  };

  it("is the SDK's no-provider refusal, and only that", () => {
    assert.equal(isFirstDayNoProvider(refusal), true);
    assert.equal(isFirstDayNotPending(refusal), false);
    assert.equal(
      isFirstDayNoProvider({
        status: 409,
        body: { error: "x", code: "first_day_not_started" },
      }),
      false,
    );
  });

  it("is a quiet expected state, never a bug report", () => {
    const err = Object.assign(new Error("engine error 409"), refusal);
    assert.equal(classifyQuietError(err), "first_day_no_provider");
    assert.equal(
      classifyQuietError(
        Object.assign(new Error("engine error 409"), {
          status: 409,
          body: { error: "x", code: "first_day_not_started" },
        }),
      ),
      null,
    );
  });
});

describe("a start whose AI could not be reached", () => {
  const refusal = {
    status: 409,
    body: {
      error: "the AI provider could not be reached; try again in a minute",
      code: "first_day_provider_unavailable",
    },
  };

  it("is the SDK's provider-unavailable refusal, and only that", () => {
    assert.equal(isFirstDayProviderUnavailable(refusal), true);
    assert.equal(isFirstDayNoProvider(refusal), false);
    assert.equal(isFirstDayNotPending(refusal), false);
  });

  it("is a quiet class, never the bug pair (HOUSTON-APP-5H4)", () => {
    const err = Object.assign(new Error("engine error 409"), refusal);
    assert.equal(classifyQuietError(err), "first_day_provider_unavailable");
  });
});

describe("a start the provider blocks", () => {
  const refusal = {
    status: 409,
    body: {
      error: "Your GitHub Copilot account is blocked by the provider.",
      code: "provider_account_blocked",
      provider: "github-copilot",
    },
  };

  it("is the SDK's account-blocked refusal, naming the provider", () => {
    assert.equal(firstDayAccountBlocked(refusal)?.provider, "github-copilot");
    assert.equal(isFirstDayNoProvider(refusal), false);
    assert.equal(isFirstDayProviderUnavailable(refusal), false);
  });

  it("is a quiet class, never the bug pair", () => {
    const err = Object.assign(new Error("engine error 409"), refusal);
    assert.equal(classifyQuietError(err), "first_day_account_blocked");
  });
});
