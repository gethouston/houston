import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { BillingCheckoutTracker } from "@houston/sdk";
import type { ReservedTab } from "../src/lib/browser-tab.ts";
import {
  type OrgCheckoutRun,
  runOrgCheckout,
} from "../src/lib/org-checkout-run.ts";

const URL = "https://checkout.stripe.com/c/acme";

function tracker() {
  return new BillingCheckoutTracker({
    now: () => 0,
    setTimeout: () => 1,
    clearTimeout: () => {},
  });
}

function tab(navigate: ReservedTab["navigate"]) {
  const log = { discarded: 0, navigated: [] as string[] };
  const reserved: ReservedTab = {
    navigate: (url) => {
      log.navigated.push(url);
      return navigate(url);
    },
    discard: () => {
      log.discarded += 1;
    },
  };
  return { reserved, log };
}

function run(patch: Partial<OrgCheckoutRun>) {
  const reports: string[] = [];
  const opened: string[] = [];
  const base: OrgCheckoutRun = {
    orgSlug: "acme",
    create: async () => ({ url: URL }),
    tab: null,
    open: async (url) => {
      opened.push(url);
      return true;
    },
    refresh: async () => {},
    report: (command) => {
      reports.push(command);
    },
    ...patch,
  };
  return { base, reports, opened };
}

describe("runOrgCheckout", () => {
  it("points the reserved tab at checkout and offers no link", async () => {
    const t = tab(() => true);
    const { base, opened } = run({ tab: t.reserved });
    strictEqual(await runOrgCheckout(tracker(), base), null);
    deepStrictEqual(t.log.navigated, [URL]);
    deepStrictEqual(opened, []);
  });

  it("falls back to a plain open when the tab was closed", async () => {
    const t = tab(() => false);
    const { base, opened } = run({ tab: t.reserved });
    strictEqual(await runOrgCheckout(tracker(), base), null);
    deepStrictEqual(opened, [URL]);
  });

  it("keeps the link when a throwing tab and a refused open leave nothing open", async () => {
    const t = tab(() => {
      throw new Error("tab gone");
    });
    const { base, reports } = run({ tab: t.reserved, open: async () => false });
    strictEqual(await runOrgCheckout(tracker(), base), URL);
    deepStrictEqual(reports, ["billing_checkout_tab"]);
    strictEqual(t.log.discarded, 1);
  });

  it("keeps the link when the open itself throws after the session was made", async () => {
    const { base, reports } = run({
      open: async () => {
        throw new Error("opener crashed");
      },
    });
    strictEqual(await runOrgCheckout(tracker(), base), URL);
    deepStrictEqual(reports, ["billing_checkout"]);
  });

  it("closes the empty tab when the session cannot be made", async () => {
    const t = tab(() => true);
    const { base, reports } = run({
      tab: t.reserved,
      create: async () => {
        throw new Error("403 not_billing_owner");
      },
    });
    strictEqual(await runOrgCheckout(tracker(), base), null);
    strictEqual(t.log.discarded, 1);
    deepStrictEqual(reports, ["billing_checkout"]);
  });

  it("closes the empty tab and sends nothing while another checkout is outstanding", async () => {
    const shared = tracker();
    await runOrgCheckout(shared, run({}).base);
    const t = tab(() => true);
    let created = 0;
    const { base } = run({
      orgSlug: "other",
      tab: t.reserved,
      create: async () => {
        created += 1;
        return { url: URL };
      },
    });
    strictEqual(await runOrgCheckout(shared, base), null);
    strictEqual(created, 0);
    strictEqual(t.log.discarded, 1);
  });

  it("offers a made session's own link when another checkout keeps it from starting", async () => {
    const shared = tracker();
    await runOrgCheckout(shared, run({ open: async () => false }).base);
    const LABS = "https://checkout.stripe.com/c/labs";
    const { base } = run({
      orgSlug: "labs",
      create: async () => ({ url: LABS }),
      madeUrl: LABS,
    });
    strictEqual(await runOrgCheckout(shared, base), LABS);
  });

  it("offers nothing when the identity changed while the checkout started", async () => {
    const shared = tracker();
    const { base } = run({
      madeUrl: URL,
      create: async () => {
        shared.reset();
        return { url: URL };
      },
    });
    strictEqual(await runOrgCheckout(shared, base), null);
  });
});
