import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { useOrgNav } from "../src/components/organization/org-nav-store.ts";
import { DEFAULT_ORG_TAB } from "../src/components/organization/org-view-model.ts";

/**
 * The one-shot pin that deep-links the Organization dashboard onto a section:
 * the shell's team-status banner and trial pill set it, then navigate; the
 * dashboard consumes it and clears it. The store is a module singleton, so
 * each test starts from the state the app boots with.
 */
const INITIAL = useOrgNav.getInitialState();

beforeEach(() => {
  useOrgNav.setState(INITIAL, true);
});

describe("the Organization dashboard's section pin", () => {
  it("boots with nothing pinned, so the dashboard picks its own section", () => {
    assert.equal(useOrgNav.getState().requestedTab, null);
    assert.equal(DEFAULT_ORG_TAB, "companyContext");
  });

  it("carries the caller's section across the navigation that follows it", () => {
    // Settings is kept alive, so the pin has to survive the hop from the
    // shell's banner to a dashboard that may already be mounted.
    const seen: (string | null)[] = [];
    const unsubscribe = useOrgNav.subscribe((state) =>
      seen.push(state.requestedTab),
    );
    useOrgNav.getState().requestTab("billing");
    assert.equal(useOrgNav.getState().requestedTab, "billing");
    assert.deepEqual(seen, ["billing"]);
    unsubscribe();
  });

  it("is spent once: clearing it leaves the next visit unpinned", () => {
    // A pin the view never dropped would drag every later visit to Settings
    // back onto Billing, whatever the user came for.
    useOrgNav.getState().requestTab("billing");
    useOrgNav.getState().clearRequestedTab();
    assert.equal(useOrgNav.getState().requestedTab, null);
  });

  it("pins the same section again after it was consumed", () => {
    // The banner is a standing control: tapping it twice must deep-link twice,
    // which only works if the view's clear is what ends the first request.
    useOrgNav.getState().requestTab("billing");
    useOrgNav.getState().clearRequestedTab();
    const seen: (string | null)[] = [];
    const unsubscribe = useOrgNav.subscribe((state) =>
      seen.push(state.requestedTab),
    );
    useOrgNav.getState().requestTab("billing");
    assert.deepEqual(seen, ["billing"]);
    assert.equal(useOrgNav.getState().requestedTab, "billing");
    unsubscribe();
  });

  it("takes the last caller's section when two arrive unconsumed", () => {
    useOrgNav.getState().requestTab("billing");
    useOrgNav.getState().requestTab("people");
    assert.equal(useOrgNav.getState().requestedTab, "people");
  });

  it("keeps ONE identity for both writers across every write", () => {
    // The view holds them in effect dependencies; a fresh function per write
    // would re-run the consuming effect on every request.
    const { requestTab, clearRequestedTab } = useOrgNav.getState();
    requestTab("people");
    clearRequestedTab();
    assert.equal(useOrgNav.getState().requestTab, requestTab);
    assert.equal(useOrgNav.getState().clearRequestedTab, clearRequestedTab);
  });
});
