import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { contextSlotState } from "../src/components/context/context-slot-state.ts";

describe("contextSlotState", () => {
  it("loads while the agents or the read are still on their way", () => {
    strictEqual(
      contextSlotState({
        agentsLoaded: false,
        agentPath: undefined,
        hasData: false,
      }),
      "loading",
    );
    strictEqual(
      contextSlotState({
        agentsLoaded: true,
        agentPath: "ws/a",
        hasData: false,
      }),
      "loading",
    );
  });

  it("says there is no AI Employee to keep it with, instead of spinning forever", () => {
    strictEqual(
      contextSlotState({
        agentsLoaded: true,
        agentPath: undefined,
        hasData: false,
      }),
      "noAgent",
    );
  });

  it("is ready once the agent's read lands", () => {
    strictEqual(
      contextSlotState({
        agentsLoaded: true,
        agentPath: "ws/a",
        hasData: true,
      }),
      "ready",
    );
  });
});

describe("the context editor's waiting frame", () => {
  it("names the missing AI Employee instead of spinning", async () => {
    const React = await import("react");
    Object.assign(globalThis, { React });
    const { renderToStaticMarkup } = await import("react-dom/server");
    const i18next = (await import("i18next")).default;
    const { initReactI18next } = await import("react-i18next");
    const context = (
      await import("../src/locales/en/context.json", { with: { type: "json" } })
    ).default;
    await i18next.use(initReactI18next).init({
      lng: "en",
      ns: ["context"],
      resources: { en: { context } },
    });
    const { ContextSlotWaiting } = await import(
      "../src/components/context/context-slot-waiting.tsx"
    );
    const noAgent = renderToStaticMarkup(
      React.createElement(ContextSlotWaiting, { state: "noAgent" }),
    );
    strictEqual(noAgent.includes("No AI Employees yet"), true);
    strictEqual(noAgent.includes('role="status"'), false);
    const loading = renderToStaticMarkup(
      React.createElement(ContextSlotWaiting, { state: "loading" }),
    );
    strictEqual(loading.includes("No AI Employees yet"), false);
    strictEqual(loading.includes('role="status"'), true);
  });
});
