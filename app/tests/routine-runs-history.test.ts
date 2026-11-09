import { equal, ok } from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { RoutineRun } from "@houston/sdk";
import en from "../src/locales/en/routines.json" with { type: "json" };
import es from "../src/locales/es/routines.json" with { type: "json" };
import pt from "../src/locales/pt/routines.json" with { type: "json" };

const resources = { en, es, pt };
let render: (runs: RoutineRun[], language: string) => Promise<string>;
const failed: RoutineRun = {
  id: "run1",
  routine_id: "r1",
  status: "error",
  session_key: "",
  started_at: "2026-10-04T09:00:00.000Z",
  completed_at: "2026-10-04T09:15:00.000Z",
  summary:
    "The routine could not start before its delivery deadline. Retry the routine.",
  delivery_failure: { code: "pool_delivery_expired" },
};

before(async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = await import("react-dom/server");
  const i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["routines"],
    resources: {
      en: { routines: en },
      es: { routines: es },
      pt: { routines: pt },
    },
  });
  const { RoutineRunsHistory } = await import(
    "../src/components/agent/routine-runs-dialog.tsx"
  );
  render = async (runs, language) => {
    await i18next.changeLanguage(language);
    return renderToStaticMarkup(
      React.createElement(RoutineRunsHistory, {
        runs,
        locale: language,
        onOpenRun: () => undefined,
      }),
    )
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/\s+/g, " ");
  };
});

describe("routine history failure copy", () => {
  for (const language of ["en", "es", "pt"] as const) {
    it(`renders authored delivery copy in ${language}`, async () => {
      const html = await render([failed], language);
      ok(
        html.includes(resources[language].details.failure.poolDeliveryExpired),
        html,
      );
      ok(html.includes(resources[language].details.status.error), html);
      equal(html.includes(failed.summary ?? ""), false);
    });
  }

  for (const language of ["en", "es", "pt"] as const) {
    it(`renders authored creator-access copy in ${language}`, async () => {
      const refused: RoutineRun = {
        ...failed,
        summary: "cloud's English summary",
        delivery_failure: { code: "creator_no_access" },
      };
      const html = await render([refused], language);
      ok(
        html.includes(resources[language].details.failure.creatorNoAccess),
        html,
      );
      equal(html.includes("cloud's English summary"), false);
    });
  }

  for (const language of ["en", "es", "pt"] as const) {
    it(`renders authored data-repair copy in ${language}`, async () => {
      const blocked: RoutineRun = {
        ...failed,
        summary: "cloud's English summary",
        delivery_failure: { code: "agent_data_needs_repair" },
      };
      const html = await render([blocked], language);
      ok(
        html.includes(resources[language].details.failure.agentDataNeedsRepair),
        html,
      );
      equal(html.includes("cloud's English summary"), false);
    });
  }

  it("keeps account failure copy and ordinary run summaries", async () => {
    const { delivery_failure: _, ...base } = failed;
    const accountRun: RoutineRun = {
      ...base,
      failure: { code: "out_of_credits", provider: "anthropic" },
    };
    ok((await render([accountRun], "en")).includes("out of credits"));
    ok((await render([base], "en")).includes(base.summary ?? ""));
  });
});
