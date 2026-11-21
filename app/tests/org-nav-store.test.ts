import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { useOrgNav } from "../src/components/organization/org-nav-store.ts";
import { DEFAULT_ORG_TAB } from "../src/components/organization/org-view-model.ts";

const INITIAL = useOrgNav.getInitialState();

beforeEach(() => {
  useOrgNav.setState(INITIAL, true);
});

describe("the Organization dashboard's section pin", () => {
  it("boots with nothing pinned, so the dashboard picks its own section", () => {
    assert.equal(useOrgNav.getState().requestedTab, null);
    assert.equal(DEFAULT_ORG_TAB, "orgChart");
  });

  it("carries the caller's section across the navigation that follows it", () => {
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
    useOrgNav.getState().requestTab("billing");
    useOrgNav.getState().clearRequestedTab();
    assert.equal(useOrgNav.getState().requestedTab, null);
  });

  it("pins the same section again after it was consumed", () => {
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
    const { requestTab, clearRequestedTab } = useOrgNav.getState();
    requestTab("people");
    clearRequestedTab();
    assert.equal(useOrgNav.getState().requestTab, requestTab);
    assert.equal(useOrgNav.getState().clearRequestedTab, clearRequestedTab);
  });
});
