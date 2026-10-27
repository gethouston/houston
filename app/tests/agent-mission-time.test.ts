import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { TooltipProvider } from "@houston-ai/core";
import { createInstance } from "i18next";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { AgentMissionRow } from "../src/components/agents-home/agent-mission-row.tsx";

Object.assign(globalThis, { React });
process.env.TZ = "UTC";

it("phone mission rows show last-message time, falling back only for an older row", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-27T17:00:00.000Z"),
  });
  const board: object = JSON.parse(
    readFileSync(
      new URL("../src/locales/es/board.json", import.meta.url),
      "utf8",
    ),
  );
  const i18n = createInstance();
  await i18n.init({
    lng: "es",
    resources: { es: { board, shell: {} } },
    interpolation: { escapeValue: false },
  });
  const render = (last_message_at?: string) =>
    renderToStaticMarkup(
      React.createElement(
        I18nextProvider,
        { i18n },
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(AgentMissionRow, {
            mission: {
              id: "m1",
              title: "Draft",
              type: "activity",
              agent_path: "a1",
              updated_at: "2026-10-27T16:25:00.000Z",
              last_message_at,
            },
            status: "done",
            onOpen() {},
          }),
        ),
      ),
    );
  assert.match(
    render("2026-10-26T10:00:00.000Z"),
    /<time[^>]*dateTime="2026-10-26T10:00:00.000Z"[^>]*>Ayer<\/time>/,
  );
  assert.match(render(), />16:25<\/time>/);
  assert.match(render("2026-10-27T16:59:30.000Z"), />Ahora<\/time>/);
});
