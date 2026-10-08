import { deepEqual, ok } from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

// Store-safe payments, wired: every place that can open Stripe, show a price
// or sell Plus answers to `lib/purchase-policy.ts`. A new entry point fails
// the inventory below until someone decides how it is gated in the store apps.

const SRC = join(import.meta.dirname, "../src");
const read = (file: string) => readFileSync(join(SRC, file), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [relative(SRC, path)] : [];
  });
}

/** Opens checkout or the portal, formats a price, or draws a sale. */
const ENTRY_POINT =
  /\b(usePlusCheckout|usePlusPortal|useCheckout|usePortal|planPriceAmounts|planOffer|planAnnouncementView)\(|<(PlanPrice|UpgradeCard|BillingInvoices|PlanAnnouncementDialog)\b/;

/** Each entry point and the file whose policy check gates it. */
const GATED_BY: Record<string, string> = {
  "components/organization/billing-tab.tsx":
    "components/organization/billing-tab.tsx",
  "components/settings/sections/billing-upgrade-card.tsx":
    "components/settings/sections/billing-upgrade-card.tsx",
  "components/settings/sections/plan-current-card.tsx":
    "components/settings/sections/plan-current-card.tsx",
  "components/settings/sections/plan-price.tsx":
    "components/settings/sections/plan-price.tsx",
  // Draws the cards above, which gate themselves, and the invoices.
  "components/settings/sections/plan.tsx":
    "components/settings/sections/billing-invoices.tsx",
  // Only ever opened by the plan lifecycle's `storeSafePlanDialog`.
  "components/shell/plan-announcement-dialog.tsx":
    "components/shell/plan-lifecycle.tsx",
  "components/shell/plan-composer-state.tsx":
    "components/shell/plan-composer-state.tsx",
  "components/shell/plan-lifecycle.tsx": "components/shell/plan-lifecycle.tsx",
  "hooks/queries/use-billing.ts": "hooks/queries/use-billing.ts",
  "hooks/queries/use-plan.ts": "hooks/queries/use-plan.ts",
  "hooks/queries/use-plus-checkout.ts": "hooks/queries/use-plus-checkout.ts",
};

/** Upsell copy and Upgrade buttons that sell without opening Stripe. */
const UPSELL_SURFACES = [
  "components/agent/routine-plan-skip-notice-view.tsx",
  "components/settings/settings-index.tsx",
  "components/shell/plan-upgrade-row.tsx",
  "components/shell/provider-error-cards/plan-limit.tsx",
  "components/shell/team-status-banner.tsx",
  "lib/plan-floor-toast.ts",
];

const consultsPolicy = (file: string) =>
  /from "[./]+\/(lib\/)?purchase-(policy|approval)(\.ts)?"/.test(read(file)) &&
  /\b(canPurchaseInApp|refuseNativePurchase|storeSafePlanDialog|blocksPurchaseUrl|refusesPurchaseApproval)\(/.test(
    read(file),
  );

describe("purchase entry points", () => {
  it("are exactly the inventoried ones", () => {
    const found = sourceFiles(SRC)
      .filter((file) => file !== "lib/purchase-policy.ts")
      .filter((file) => ENTRY_POINT.test(read(file)))
      .sort();
    deepEqual(found, Object.keys(GATED_BY).sort());
  });

  for (const [file, gate] of Object.entries(GATED_BY))
    it(`${file} is gated by the purchase policy`, () => {
      ok(consultsPolicy(gate), `${gate} does not consult purchase-policy`);
    });

  for (const file of UPSELL_SURFACES)
    it(`${file} consults the purchase policy`, () => {
      ok(consultsPolicy(file), file);
    });
});

/** The body of `export [async] function <name>(`, up to the next export. */
function body(file: string, name: string): string {
  const source = read(file);
  const start = source.search(
    new RegExp(`export (async )?function ${name}\\(`),
  );
  ok(start >= 0, `${name} not found in ${file}`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("checkout and portal hooks", () => {
  const HOOKS = [
    [
      "hooks/queries/use-plus-checkout.ts",
      "usePlusCheckout",
      "plus_checkout",
      "tracker",
    ],
    [
      "hooks/queries/use-plan.ts",
      "usePlusPortal",
      "plus_portal",
      "tauriOrg.createPlusPortal",
    ],
    [
      "hooks/queries/use-billing.ts",
      "useCheckout",
      "billing_checkout",
      "tauriOrg.createCheckout",
    ],
    [
      "hooks/queries/use-billing.ts",
      "usePortal",
      "billing_portal",
      "tauriOrg.createPortal",
    ],
  ] as const;

  for (const [file, hook, command, engineCall] of HOOKS)
    it(`${hook} refuses before it reaches Stripe`, () => {
      const source = body(file, hook);
      const refusal = source.indexOf(
        `refuseNativePurchase("${command}", reportError)`,
      );
      ok(refusal >= 0, `${hook} never asks the purchase policy`);
      const call = source.indexOf(engineCall);
      ok(call > refusal, `${hook} reaches ${engineCall} before the refusal`);
    });
});

/** Copy that sends someone to ask for an upgrade (owner-directed). */
const OWNER_UPGRADE_COPY =
  /degrade\.(owner|member|writeBlocked)|billing\.askOwner|inviteInbox\.errors\.\$\{|shareViaTeam\.moveFailed\.\$\{/;

/** Each place that shows it, all with a store-app variant. */
const OWNER_UPGRADE_SURFACES = [
  "components/agent/share-via-team-failed-steps.tsx",
  "components/organization/billing-tab.tsx",
  "components/shell/team-status-banner.tsx",
  "hooks/queries/use-invites.ts",
  "lib/tauri.ts",
];

describe("owner-directed upgrade copy", () => {
  it("is shown exactly where inventoried", () => {
    const found = sourceFiles(SRC)
      .filter((file) => OWNER_UPGRADE_COPY.test(read(file)))
      .sort();
    deepEqual(found, OWNER_UPGRADE_SURFACES);
  });

  for (const file of OWNER_UPGRADE_SURFACES)
    it(`${file} has a store-app variant`, () => {
      ok(consultsPolicy(file), file);
    });
});

describe("AI Manager purchases and payment links", () => {
  it("every external open refuses a payment page before the browser", () => {
    const source = body("lib/open-external-url.ts", "openExternalUrl");
    const guard = source.indexOf("blocksPurchaseUrl(url)");
    ok(guard >= 0, "openExternalUrl never asks the purchase policy");
    ok(source.indexOf("osOpenUrl(") > guard, "osOpenUrl runs before the guard");
  });

  it("chat draws a payment link as text before any other link rule", () => {
    const source = read("components/use-agent-chat-panel.tsx");
    const start = source.indexOf("const renderLink = useCallback");
    const guard = source.indexOf("blocksPurchaseUrl(href)", start);
    ok(guard > start, "renderLink never asks the purchase policy");
    ok(
      source.indexOf("parseToolkitFromHref(href)", start) > guard,
      "a link rule runs before the payment-link guard",
    );
  });

  it("a purchase approval is refused before it is worded as approvable", () => {
    const source = read("lib/interaction-approval-labels.ts");
    const guard = source.indexOf("refusesPurchaseApproval(operation)");
    ok(guard >= 0, "the approval card never asks the purchase policy");
    ok(source.indexOf("copy.sentence(operation)") > guard);
  });
});

describe("store-app copy", () => {
  const locale = (language: string, ns: string) =>
    JSON.parse(
      readFileSync(join(SRC, `locales/${language}/${ns}.json`), "utf8"),
    );
  const strings = (value: unknown): string[] =>
    typeof value === "string"
      ? [value]
      : Object.values(value as Record<string, unknown>).flatMap(strings);
  const SELLING: Record<string, RegExp> = {
    en: /upgrade|\bPlus\b|price|\$\d/i,
    es: /mejora|pásate|\bPlus\b|precio|\$\d/i,
    pt: /upgrade|assine|\bPlus\b|preço|\$\d/i,
  };

  for (const language of ["en", "es", "pt"])
    it(`${language} never sells or sends anyone to upgrade`, () => {
      const plan = locale(language, "plan");
      const copy = [
        ...strings(plan.native),
        plan.managedOnWeb,
        plan.manageOnWeb,
        ...strings(locale(language, "teams").native),
        locale(language, "chat").approvalCard.storeRefusalOk,
      ];
      for (const line of copy)
        ok(!SELLING[language]?.test(line), `${language}: ${line}`);
    });
});
