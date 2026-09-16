import assert from "node:assert/strict";
import test from "node:test";
import { contextRunsForQuery } from "../src/components/shell/context-step-model.ts";
import {
  AGENT_CONTEXT_IDS,
  type AgentContextId,
} from "../src/lib/agent-role-catalog.ts";
import en from "../src/locales/en/agent-onboarding.json" with { type: "json" };

const CONTEXTS: Record<string, string> = en.roleSetup.contexts;
const english = (id: AgentContextId) => CONTEXTS[id];

/** Labels the test owns, so matching is checked without pinning the catalog's
 *  copy: the first two industries get names worth searching for. */
const staged = (id: AgentContextId) => {
  const index = AGENT_CONTEXT_IDS.indexOf(id);
  if (index === 0) return "Logística";
  if (index === 1) return "Freight";
  return `Industry ${String(index).padStart(3, "0")}`;
};

const idsOf = (sections: ReturnType<typeof contextRunsForQuery>) =>
  sections.flatMap((section) => section.options.map((option) => option.id));

test("an empty query offers every industry once, as one unheaded run", () => {
  const sections = contextRunsForQuery("  ", english);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].id, "contexts");
  assert.equal(sections[0].label, undefined);

  const ids = idsOf(sections);
  assert.equal(new Set(ids).size, ids.length, "an industry is offered twice");
  assert.deepEqual(new Set(ids), new Set(AGENT_CONTEXT_IDS));
});

test("the run reads in the order it is scanned: by translated label", () => {
  const labels = contextRunsForQuery("", english)[0].options.map(
    (option) => option.label,
  );
  assert.deepEqual(
    labels,
    [...labels].sort((a, b) => a.localeCompare(b)),
  );
});

test("the filter matches the label the user reads, accent- and case-blind", () => {
  const ids = idsOf(contextRunsForQuery("  LOGISTICA ", staged));
  assert.deepEqual(ids, [AGENT_CONTEXT_IDS[0]]);
});

test("a partial word is enough, wherever it falls in the label", () => {
  const ids = idsOf(contextRunsForQuery("eigh", staged));
  assert.deepEqual(ids, [AGENT_CONTEXT_IDS[1]]);
});

test("a query nothing matches leaves no runs for the empty state to hide", () => {
  assert.deepEqual(contextRunsForQuery("falconer", staged), []);
});

test("every industry stays reachable by typing its own name", () => {
  for (const id of AGENT_CONTEXT_IDS) {
    assert.ok(
      idsOf(contextRunsForQuery(CONTEXTS[id], english)).includes(id),
      id,
    );
  }
});
