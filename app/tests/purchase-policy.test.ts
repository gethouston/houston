import { deepEqual, equal } from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  blocksPurchaseUrl,
  canPurchaseInApp,
  isPurchaseOperation,
  isPurchaseUrl,
  refuseNativePurchase,
  storeSafePlanDialog,
} from "../src/lib/purchase-policy.ts";
import { enterNativeApp } from "./support/native-surface.ts";

// Store-safe payments: the iOS/Android apps never sell (no price, no
// checkout, no portal, no upsell); desktop and every browser tab do.

let leave: (() => void) | null = null;
afterEach(() => {
  leave?.();
  leave = null;
});

describe("canPurchaseInApp", () => {
  it("allows purchases on desktop and in a browser tab", () => {
    equal(canPurchaseInApp(), true);
  });

  for (const surface of ["ios", "android"] as const)
    it(`refuses purchases inside the ${surface} app`, () => {
      leave = enterNativeApp(surface);
      equal(canPurchaseInApp(), false);
    });
});

describe("refuseNativePurchase", () => {
  const recorder = () => {
    const reports: Array<[string, string]> = [];
    return {
      reports,
      report: (command: string, message: string) => {
        reports.push([command, message]);
      },
    };
  };

  it("lets the purchase through, unreported, where Houston may sell", () => {
    const { reports, report } = recorder();
    equal(refuseNativePurchase("plus_checkout", report), false);
    deepEqual(reports, []);
  });

  it("refuses every Stripe page inside a store app and reports the bug", () => {
    leave = enterNativeApp("android");
    const { reports, report } = recorder();
    for (const command of [
      "plus_checkout",
      "plus_portal",
      "billing_checkout",
      "billing_portal",
    ] as const)
      equal(refuseNativePurchase(command, report), true);
    deepEqual(
      reports.map(([command]) => command),
      ["plus_checkout", "plus_portal", "billing_checkout", "billing_portal"],
    );
  });
});

describe("storeSafePlanDialog", () => {
  it("keeps every plan dialog where Houston may sell", () => {
    for (const dialog of ["resume", "keep", "announcement", null] as const)
      equal(storeSafePlanDialog(dialog), dialog);
  });

  it("never opens the launch announcement inside a store app", () => {
    leave = enterNativeApp();
    equal(storeSafePlanDialog("announcement"), null);
  });

  it("still opens the routine dialogs inside a store app", () => {
    leave = enterNativeApp();
    equal(storeSafePlanDialog("resume"), "resume");
    equal(storeSafePlanDialog("keep"), "keep");
    equal(storeSafePlanDialog(null), null);
  });
});

describe("isPurchaseOperation", () => {
  it("names every AI Manager operation that buys or opens billing", () => {
    for (const operation of [
      "createPlusCheckout",
      "createPlusPortal",
      "createCheckout",
      "createPortal",
    ])
      equal(isPurchaseOperation(operation), true, operation);
  });

  it("leaves reads and every other operation alone", () => {
    for (const operation of ["getBilling", "getPlan", "deleteAgent", ""])
      equal(isPurchaseOperation(operation), false, operation);
  });
});

describe("isPurchaseUrl", () => {
  it("recognizes Stripe's hosted payment pages", () => {
    for (const url of [
      "https://checkout.stripe.com/c/pay/cs_live_a1#fid",
      "https://billing.stripe.com/p/session/live_1",
      "https://invoice.stripe.com/i/acct_1/live_2",
      "https://pay.stripe.com/receipts/x",
      "https://buy.stripe.com/abc",
      "HTTPS://Checkout.Stripe.com/c/pay/x",
      "https://user@checkout.stripe.com:443/c/pay/x",
      "https://checkout.stripe.com./c/pay/x",
      "  https://checkout.stripe.com/c/pay/x",
    ])
      equal(isPurchaseUrl(url), true, url);
  });

  it("leaves every other link alone", () => {
    for (const url of [
      "https://gethouston.ai",
      "https://docs.stripe.com/payments",
      "https://checkout.stripe.com.evil.example/c",
      "https://example.com/?next=https://checkout.stripe.com",
      "mailto:help@gethouston.ai",
      "report.pdf",
      "",
    ])
      equal(isPurchaseUrl(url), false, url);
  });
});

describe("blocksPurchaseUrl", () => {
  const checkout = "https://checkout.stripe.com/c/pay/cs_live_a1";

  it("opens payment pages on desktop and in a browser tab", () => {
    equal(blocksPurchaseUrl(checkout), false);
  });

  it("blocks payment pages inside a store app, and only those", () => {
    leave = enterNativeApp("ios");
    equal(blocksPurchaseUrl(checkout), true);
    equal(blocksPurchaseUrl("https://gethouston.ai/help"), false);
  });
});
