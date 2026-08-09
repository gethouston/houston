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

  it("Add goes straight to the setup chat — no fork dialog in between", () => {
    const src = read(
      "../src/components/integrations/custom-integrations-section.tsx",
    );
    // The chooser dialog (guided chat vs manual form) was cut: clicking Add
    // starts the chat with the workspace's only agent immediately; only a
    // multi-agent workspace interposes the agent picker.
    ok(
      src.includes("void chatSetup.start(target)"),
      "the add handler starts the setup chat directly",
    );
    ok(
      !src.includes("CustomAddDialog"),
      "the fork dialog stays deleted from the add path",
    );
  });

  it("the agent-less surface rides the per-agent transport (gateway-safe)", () => {
    const src = read(
      "../src/components/integrations/custom-integrations-section.tsx",
    );
    // The hosted gateway proxies only the per-agent custom routes: reading the
    // list through the transport agent is what keeps the global Integrations
    // page's Custom tab from silently hiding on managed cloud (its top-level
    // fetch 404s to null). The section has no ambient agent of its own since
    // the per-agent Integrations tab was deleted, so the transport agent is the
    // ONLY thing standing between it and that silent hide.
    ok(
      src.includes("useCustomTransportAgentId()"),
      "the list rides the transport agent",
    );
    ok(
      src.includes("useCustomIntegrationsFor(transportAgentId)"),
      "and the list query is keyed on it",
    );
  });
});
