import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { useIntegrationsNav } from "../src/components/integrations-view/integrations-nav-store.ts";
import {
  DEFAULT_INTEGRATIONS_TAB,
  integrationsTabIds,
} from "../src/components/integrations-view/integrations-view-model.ts";

/**
 * The Integrations screen's open tab, as the deep links that arrive from
 * outside it see it: a notification from a finished skill-setup chat opens
 * Skills, the gate falls back to the catalog, and the screen's own lozenges
 * write the same field. The store is a module singleton, so each test starts
 * from the state the app boots with.
 */
const INITIAL = useIntegrationsNav.getInitialState();

beforeEach(() => {
  useIntegrationsNav.setState(INITIAL, true);
});

describe("the Integrations screen's open tab", () => {
  it("boots on the landing tab the screen is named by", () => {
    assert.equal(useIntegrationsNav.getState().tab, DEFAULT_INTEGRATIONS_TAB);
    assert.equal(
      integrationsTabIds({ showSkills: true }).at(0),
      useIntegrationsNav.getState().tab,
      "the screen must land on the first tab it draws",
    );
  });

  it("is ONE truth: a write from outside is what every reader sees", () => {
    // The deep-link callers read the open tab as well as write it (a
    // notification leaves a user already standing on Skills alone), so the
    // value has to live in the store rather than in the view's own state.
    const seen: string[] = [];
    const unsubscribe = useIntegrationsNav.subscribe((state) =>
      seen.push(state.tab),
    );
    useIntegrationsNav.getState().requestTab("skills");
    assert.equal(useIntegrationsNav.getState().tab, "skills");
    assert.deepEqual(seen, ["skills"]);
    unsubscribe();
  });

  it("holds the tab it was left on, with nothing to consume it", () => {
    // The screen is kept alive, so there is no second mount to re-open it on:
    // reading the tab must not clear it, and the next render comes back to the
    // same place the user left.
    useIntegrationsNav.getState().requestTab("skills");
    assert.equal(useIntegrationsNav.getState().tab, "skills");
    assert.equal(useIntegrationsNav.getState().tab, "skills");
    useIntegrationsNav.getState().requestTab("skills");
    assert.equal(useIntegrationsNav.getState().tab, "skills");
  });

  it("takes the last writer's answer", () => {
    useIntegrationsNav.getState().requestTab("skills");
    useIntegrationsNav.getState().requestTab("catalog");
    assert.equal(useIntegrationsNav.getState().tab, "catalog");
  });

  it("keeps ONE writer identity across every write", () => {
    // Callers hold `requestTab` in effect dependencies; a fresh function per
    // write would re-run those effects on every tab change.
    const first = useIntegrationsNav.getState().requestTab;
    first("skills");
    assert.equal(useIntegrationsNav.getState().requestTab, first);
  });
});
