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
    // starts the chat with the ambient (or only) agent immediately; only a
    // multi-agent workspace on the global page may interpose the agent picker.
    ok(
      src.includes("void chatSetup.start(target)"),
      "the add handler starts the setup chat directly",
    );
    ok(
      !src.includes("CustomAddDialog"),
      "the fork dialog stays deleted from the add path",
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
