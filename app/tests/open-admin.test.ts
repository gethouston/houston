import { strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { useOrgNav } from "../src/components/organization/org-nav-store.ts";
import { openAdmin } from "../src/lib/open-admin.ts";
import { useUIStore } from "../src/stores/ui.ts";

afterEach(() => {
  useUIStore.getState().reset();
  useOrgNav.getState().clearRequestedTab();
});

describe("openAdmin", () => {
  it("opens the top-level screen and closes the phone menu", () => {
    useUIStore.getState().setMobileMoreOpen(true);
    openAdmin({ nav: "reset" });
    strictEqual(useUIStore.getState().viewMode, "admin");
    strictEqual(useUIStore.getState().mobileMoreOpen, false);
    strictEqual(useOrgNav.getState().requestedTab, null);
  });

  it("pins a requested section before opening Admin", () => {
    openAdmin({ section: "billing" });
    strictEqual(useOrgNav.getState().requestedTab, "billing");
    strictEqual(useUIStore.getState().viewMode, "admin");
  });
});
