import { equal, ok } from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { Routine } from "@houston/engine-adapter";
import type { ProviderHealth } from "@houston/protocol";
import routines from "../src/locales/en/routines.json" with { type: "json" };

// The routine screen's auto-pause notice: the engine records WHY it paused a
// routine (Routine.auto_paused), the SDK picks the fix, and the banner renders
// that fix in the person's language with a Resume action. A running routine,
// or one a person paused, shows nothing.

let render: (routine: Routine, readerHealth?: ProviderHealth) => string;

const base: Routine = {
  id: "r1",
  name: "Inbox sweep",
  prompt: "check",
  schedule: "* * * * *",
  enabled: true,
  suppress_when_silent: false,
  chat_mode: "shared",
  integrations: [],
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-29T11:00:00.000Z",
};

const paused = (reason: NonNullable<Routine["auto_paused"]>["reason"]) =>
  ({
    ...base,
    enabled: false,
    auto_paused: {
      reason,
      provider: "anthropic",
      failures: 10,
      at: "2026-09-29T11:00:00.000Z",
    },
  }) satisfies Routine;

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

before(async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = await import("react-dom/server");
  const i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["routines"],
    resources: { en: { routines } },
  });
  const { RoutineAutoPauseBanner } = await import(
    "../src/components/agent/routine-auto-pause-banner.tsx"
  );
  render = (routine, readerHealth) =>
    renderToStaticMarkup(
      React.createElement(RoutineAutoPauseBanner, {
        routine,
        onResume: () => undefined,
        resuming: false,
        readerFor: (provider: string) => ({
          provider,
          health: readerHealth,
          readerIsCreator: true,
        }),
      }),
    );
});

describe("RoutineAutoPauseBanner", () => {
  it("renders nothing for a running routine or a hand pause", () => {
    equal(render(base), "");
    equal(render({ ...base, enabled: false }), "");
  });

  it("names the streak, the fix and offers Resume", () => {
    const html = text(render(paused("out_of_credits")));
    ok(html.includes("Paused after 10 failed runs in a row"), html);
    ok(html.includes("out of credits"), html);
    ok(html.includes(routines.details.autoPause.resume), html);
  });

  it("picks the fix per reason", () => {
    ok(text(render(paused("team_not_connected"))).includes("This team has no"));
    ok(text(render(paused("creator_needs_reconnect"))).includes("reconnect"));
    ok(
      text(render(paused("model_unavailable"))).includes(
        "Pick a model the account can run",
      ),
    );
  });

  it("asks to sign in again when the gateway signed the reader's account out", () => {
    const html = text(
      render(paused("creator_not_connected"), "needs_reconnect"),
    );
    ok(html.includes("needs to reconnect"), html);
    ok(!html.includes("has no"), html);
    ok(
      text(render(paused("creator_not_connected"), "not_connected")).includes(
        "has no",
      ),
    );
  });
});
