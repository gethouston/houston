import { deepStrictEqual, strictEqual } from "node:assert";
import { beforeEach, describe, it, mock } from "node:test";

type Call = { fn: string; args: unknown[] };
const calls: Call[] = [];
const record =
  (fn: string) =>
  (...args: unknown[]) =>
    calls.push({ fn, args });
const lib = (name: string) =>
  new URL(`../src/lib/${name}.ts`, import.meta.url).href;

mock.module(new URL("../src/stores/ui.ts", import.meta.url).href, {
  namedExports: {
    useUIStore: { getState: () => ({ addToast: record("addToast") }) },
  },
});
mock.module(lib("analytics"), {
  namedExports: {
    analytics: { track: record("track") },
    classifyAnalyticsError: () => "other",
  },
});
mock.module(lib("i18n"), {
  defaultExport: {
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key} ${JSON.stringify(vars)}` : key,
  },
});
mock.module(lib("providers"), {
  namedExports: {
    providerName: (id: string) =>
      id === "github-copilot" ? "GitHub Copilot" : id,
  },
});
mock.module(lib("quiet-error-report"), {
  namedExports: { reportQuietError: record("reportQuietError") },
});
for (const [name, fn] of [
  ["first-day-no-provider-toast", "showFirstDayNoProviderToast"],
  ["plan-min-interval", "surfacePlanMinInterval"],
  ["routine-gone-surface", "surfaceRoutineGone"],
  ["webhook-not-creator-toast", "showWebhookNotCreatorToast"],
] as const) {
  mock.module(lib(name), { namedExports: { [fn]: record(fn) } });
}
const { surfaceQuietState } = await import("../src/lib/quiet-state-surface.ts");

const COMMAND = "agents.start-first-day";

describe("surfaceQuietState for a refused first-day start", () => {
  beforeEach(() => {
    calls.length = 0;
    mock.method(console, "warn", () => {});
    mock.method(console, "info", () => {});
  });

  it("toasts the try-again copy and files the one counted warning when the AI cannot be reached (HOUSTON-APP-5H4)", () => {
    const err = Object.assign(new Error("engine error 409"), {
      status: 409,
      body: {
        error: "the AI provider could not be reached; try again in a minute",
        code: "first_day_provider_unavailable",
      },
    });
    strictEqual(
      surfaceQuietState(
        "first_day_provider_unavailable",
        COMMAND,
        err.message,
        err,
      ),
      true,
    );
    deepStrictEqual(
      calls.map((c) => c.fn),
      ["reportQuietError", "addToast"],
    );
    deepStrictEqual(calls[0]?.args, [
      "first_day_provider_unavailable",
      COMMAND,
      err.message,
      err,
    ]);
    deepStrictEqual(calls[1]?.args, [
      {
        title: "board:firstDay.providerUnavailable.title",
        description: "board:firstDay.providerUnavailable.body",
        variant: "info",
      },
    ]);
  });

  it("names the provider that blocks the account and reports nothing", () => {
    const err = Object.assign(new Error("engine error 409"), {
      status: 409,
      body: {
        error: "Your GitHub Copilot account is blocked by the provider.",
        code: "provider_account_blocked",
        provider: "github-copilot",
      },
    });
    strictEqual(
      surfaceQuietState("first_day_account_blocked", COMMAND, err.message, err),
      true,
    );
    deepStrictEqual(calls, [
      {
        fn: "addToast",
        args: [
          {
            title:
              'board:firstDay.accountBlocked.title {"provider":"GitHub Copilot"}',
            description:
              'board:firstDay.accountBlocked.body {"provider":"GitHub Copilot"}',
            variant: "info",
          },
        ],
      },
    ]);
  });

  it("falls back to copy without a name when the refusal names no provider", () => {
    const err = Object.assign(new Error("engine error 409"), {
      status: 409,
      body: { error: "blocked", code: "provider_account_blocked" },
    });
    surfaceQuietState("first_day_account_blocked", COMMAND, err.message, err);
    deepStrictEqual(calls[0]?.args, [
      {
        title: "board:firstDay.accountBlocked.titleAny",
        description: "board:firstDay.accountBlocked.bodyAny",
        variant: "info",
      },
    ]);
  });
});
