import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("unified custom integrations surface", () => {
  it("the loud error state only replaces an EMPTY surface, never live rows", () => {
    const src = read(
      "../src/components/integrations/use-custom-integrations-surface.tsx",
    );
    ok(
      src.includes("list.isError && list.data === undefined"),
      "error state gates on isError AND no cached data",
    );
  });

  it("Add goes straight to the setup chat — no fork dialog in between", () => {
    const src = read(
      "../src/components/integrations/use-custom-integrations-surface.tsx",
    );
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
      "../src/components/integrations/use-custom-integrations-surface.tsx",
    );
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
