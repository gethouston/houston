import assert from "node:assert/strict";
import test from "node:test";
import {
  foldForSearch,
  isChoiceSearchable,
} from "../src/components/shell/choice-step-model.ts";
import { CONTEXT_SEARCH_REACH } from "../src/components/shell/context-step-model.ts";
import { ROLE_SEARCH_REACH } from "../src/components/shell/role-step-model.ts";
import {
  AGENT_CONTEXT_IDS,
  AGENT_ROLE_IDS,
  rolesForContext,
} from "../src/lib/agent-role-catalog.ts";
import {
  AGENT_COMMON_ROLES,
  AGENT_CONTEXT_ROLES,
} from "../src/lib/agent-role-catalog-data.ts";
import en from "../src/locales/en/agent-onboarding.json" with { type: "json" };
import es from "../src/locales/es/agent-onboarding.json" with { type: "json" };
import pt from "../src/locales/pt/agent-onboarding.json" with { type: "json" };

const LOCALES = { en, es, pt };

test("every context is offered once and hires a deep run of roles", () => {
  assert.equal(new Set(AGENT_CONTEXT_IDS).size, AGENT_CONTEXT_IDS.length);
  assert.ok(
    AGENT_CONTEXT_IDS.length >= 40,
    `the catalog offers ${AGENT_CONTEXT_IDS.length} industries`,
  );
  for (const id of AGENT_CONTEXT_IDS) {
    const roles = AGENT_CONTEXT_ROLES[id];
    // An industry the user recognizes must answer the next question too: a short
    // run sends them straight back out to "Something else".
    assert.ok(roles.length >= 20, `${id} offers ${roles.length} roles`);
    assert.equal(new Set(roles).size, roles.length, `${id} repeats a role`);
  }
  assert.equal(
    new Set(AGENT_COMMON_ROLES).size,
    AGENT_COMMON_ROLES.length,
    "the shared run repeats a role",
  );
});

test("every catalog id reads in en, es and pt", () => {
  for (const [locale, bundle] of Object.entries(LOCALES)) {
    const contexts: Record<string, string> = bundle.roleSetup.contexts;
    const roles: Record<string, string> = bundle.roleSetup.roles;
    for (const id of AGENT_CONTEXT_IDS) {
      assert.ok(contexts[id]?.trim(), `${locale} is missing context ${id}`);
    }
    for (const id of AGENT_ROLE_IDS) {
      assert.ok(roles[id]?.trim(), `${locale} is missing role ${id}`);
    }
    assert.equal(
      Object.keys(contexts).length,
      AGENT_CONTEXT_IDS.length,
      `${locale} carries a context no catalog offers`,
    );
    assert.equal(
      Object.keys(roles).length,
      AGENT_ROLE_IDS.length,
      `${locale} carries a role no catalog offers`,
    );
  }
});

test("a context leads with its own roles and never repeats a shared one", () => {
  for (const id of AGENT_CONTEXT_IDS) {
    const { own, common } = rolesForContext(id);
    assert.deepEqual(own, [...AGENT_CONTEXT_ROLES[id]]);
    assert.equal(
      own.filter((role) => common.includes(role)).length,
      0,
      `${id} offers a role twice on one screen`,
    );
  }
});

test("a context the user typed themselves is offered the shared roles alone", () => {
  const { own, common } = rolesForContext(null);
  assert.deepEqual(own, []);
  assert.deepEqual(common, [...AGENT_COMMON_ROLES]);
});

/** The one label a duplicate would hide behind: the same fold the filter
 *  matches on, so "Análisis" and "analisis" count as the collision they are. */
function duplicateLabels(labels: Record<string, string>): string[] {
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const [id, label] of Object.entries(labels)) {
    const key = foldForSearch(label).trim();
    const first = seen.get(key);
    if (first) clashes.push(`${first} + ${id} both read "${label}"`);
    else seen.set(key, id);
  }
  return clashes;
}

test("no two catalog entries read the same in any language", () => {
  // Two chips with identical words are two different answers to the user's
  // eye and one arbitrary pick to their hand: the second is unreachable and
  // the first means something it doesn't say. Translating is where they creep
  // in (distinct English jobs collapsing onto one Spanish word), so every
  // language is checked, not just the source one.
  for (const [locale, bundle] of Object.entries(LOCALES)) {
    assert.deepEqual(
      duplicateLabels(bundle.roleSetup.contexts),
      [],
      `${locale} offers the same industry twice`,
    );
    assert.deepEqual(
      duplicateLabels(bundle.roleSetup.roles),
      [],
      `${locale} offers the same job twice`,
    );
  }
});

test("both questions reach far enough to keep their filter", () => {
  // The filter appears only past `SEARCH_THRESHOLD` reachable options. Neither
  // question can be scanned without one, so a catalog that shrank under the
  // threshold would silently drop the field and strand the rest of the run.
  assert.ok(
    isChoiceSearchable(CONTEXT_SEARCH_REACH),
    `the industry question reaches ${CONTEXT_SEARCH_REACH}, under the filter's threshold`,
  );
  assert.ok(
    isChoiceSearchable(ROLE_SEARCH_REACH),
    `the role question reaches ${ROLE_SEARCH_REACH}, under the filter's threshold`,
  );
});
