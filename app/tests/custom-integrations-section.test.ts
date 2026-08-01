import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("custom integrations section error truth table", () => {
  it("the loud error state only replaces an EMPTY surface, never live rows", () => {
    const src = read(
      "../src/components/integrations/custom-integrations-section.tsx",
    );
    // A failed BACKGROUND refetch keeps `list.isError` true while `data`
    // still holds the last good list (React Query v5). Gating the error
    // panel on `data === undefined` keeps those rows on screen; dropping
    // the guard would erase the whole custom surface on one transient 500.
    ok(
      src.includes("list.isError && list.data === undefined"),
      "error state gates on isError AND no cached data",
    );
  });

  it("the add form's detect verdict is latest-check-wins", () => {
    const src = read("../src/components/integrations/custom-add-form.tsx");
    // A late detect result must never clobber a newer verdict, independent
    // of the Check button's disabled-while-pending coupling.
    ok(
      src.includes("seq !== checkSeq.current"),
      "stale detect results are dropped by sequence",
    );
    // ...and the verdict remembers WHICH url it judged, so an edited address
    // can never wear a claim made about the previous one.
    ok(
      src.includes("verdict.url === form.url.trim()"),
      "the shown verdict is keyed to the URL it judged",
    );
  });

  it("Add opens the fork, with the guided chat as the visually LEAD path", () => {
    const section = read(
      "../src/components/integrations/custom-integrations-section.tsx",
    );
    // Clicking Add opens the chat-vs-manual chooser again (HOU-1083): the
    // manual form is the escape hatch for people who already hold the URL,
    // so it must stay reachable — but the guided chat leads.
    ok(
      section.includes("<CustomAddFlow"),
      "the add button opens the fork flow, not the chat directly",
    );
    ok(
      section.includes("onNeedsKey={(slug) => selection.openKey(slug)}"),
      "a manual add that lands pending chains into the secure key dialog",
    );

    const dialog = read("../src/components/integrations/custom-add-dialog.tsx");
    ok(
      dialog.includes('emphasis="lead"'),
      "exactly the chat card carries the lead emphasis",
    );
    ok(
      dialog.split('emphasis="lead"').length === 2,
      "only ONE card leads — two primaries is no recommendation at all",
    );
    // The chat card must come FIRST in the DOM: the lead path is also the
    // first tab stop and the first thing a screen reader reaches.
    ok(
      dialog.indexOf("custom.add.chatTitle") <
        dialog.indexOf("custom.add.manualTitle"),
      "the chat choice precedes the manual choice",
    );
  });

  it("the manual form rides the per-agent transport (gateway-safe writes)", () => {
    const section = read(
      "../src/components/integrations/custom-integrations-section.tsx",
    );
    // detect + add must go through /agents/:id/... — the gateway proxies no
    // top-level custom route, so a transport-less form 404s on managed cloud.
    ok(
      section.includes("transportAgentId={transportAgentId}"),
      "the fork flow receives the resolved transport agent",
    );
    const flow = read("../src/components/integrations/custom-add-flow.tsx");
    ok(
      flow.includes("agentId={transportAgentId}"),
      "the fork dialog hands the transport agent to the manual form",
    );
    const form = read("../src/components/integrations/custom-add-form.tsx");
    ok(
      form.includes("useDetectCustomIntegration(agentId)") &&
        form.includes("useAddCustomIntegration(agentId)"),
      "both writes are agentId-aware",
    );
  });

  it("the chat path still resolves its agent without a dead question", () => {
    const flow = read("../src/components/integrations/custom-add-flow.tsx");
    // #1171's win, kept: the ambient agent (per-agent tab) or a single-agent
    // workspace answers "which agent?" by itself — only a genuinely
    // ambiguous workspace sees the picker.
    ok(
      flow.includes("agent ?? (agents.length === 1 ? agents[0] : undefined)"),
      "the picker is the fallback, not the default",
    );
    ok(
      flow.includes("<AgentPickerDialog"),
      "a multi-agent workspace still gets the picker",
    );
  });

  it("agent-less surfaces ride the per-agent transport (gateway-safe)", () => {
    const src = read(
      "../src/components/integrations/custom-integrations-section.tsx",
    );
    // The hosted gateway proxies only the per-agent custom routes: without a
    // transport fallback the global Integrations page's custom tab silently
    // hides on managed cloud (its top-level fetch 404s to null).
    ok(
      src.includes("useCustomTransportAgentId(agent?.id)"),
      "the list rides the transport agent, not only the ambient one",
    );
  });
});
