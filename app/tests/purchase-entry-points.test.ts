import { deepEqual, ok } from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

const SRC = join(import.meta.dirname, "../src");
const read = (file: string) => readFileSync(join(SRC, file), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [relative(SRC, path)] : [];
  });
}

const ENTRY_POINT =
  /\b(useOrgCheckout|usePortal|formatPlanAmount)\(|<(ReferralPanel)\b/;

const GATED_BY: Record<string, string> = {
  "components/auth/sign-in-screen.tsx": "components/auth/sign-in-screen.tsx",
  "components/organization/billing-plan-action.tsx":
    "components/organization/billing-plan-card.tsx",
  "components/organization/billing-plan-card.tsx":
    "components/organization/billing-plan-card.tsx",
  "components/organization/checkout-price-line.tsx":
    "components/organization/billing-plan-card.tsx",
  "components/organization/seat-interval-choice.tsx":
    "components/organization/billing-plan-card.tsx",
  "components/organization/people-add-done.tsx":
    "components/organization/use-seat-add.ts",
  "components/organization/people-seat-note.tsx":
    "components/organization/use-seat-add.ts",
  "components/organization/seat-charge-dialog.tsx":
    "components/organization/use-seat-add.ts",
  "components/shell/billing-change-copy.ts":
    "components/shell/billing-change-copy.ts",
  "components/shell/create-organization-dialog.tsx":
    "components/shell/paid-org-offer-dialog.tsx",
  "components/shell/free-org-picker-rows.tsx":
    "components/shell/free-org-picker-rows.tsx",
  "components/shell/paid-org-offer-dialog.tsx":
    "components/shell/paid-org-offer-dialog.tsx",
  "components/shell/promo-ended-steps.tsx":
    "components/shell/promo-ended-modal.tsx",
  "hooks/queries/use-billing.ts": "hooks/queries/use-billing.ts",
  "hooks/queries/use-org-checkout.ts": "hooks/queries/use-org-checkout.ts",
  "hooks/use-team-status.ts": "components/shell/team-status-banner.tsx",
};

const UPSELL_SURFACES = [
  "components/agent/routine-plan-skip-notice-view.tsx",
  "components/shell/plan-composer-state.tsx",
  "components/shell/plan-keep-footer.tsx",
  "components/shell/org-locked-card.tsx",
  "components/shell/plan-upgrade-row.tsx",
  "components/shell/provider-error-cards/plan-limit.tsx",
  "components/shell/team-status-banner.tsx",
  "components/shell/team-status-checkout-dialog.tsx",
  "components/auth/referral-panel.tsx",
];

const consultsPolicy = (file: string) =>
  /from "[./]+\/(lib\/)?purchase-(policy|approval)(\.ts)?"/.test(read(file)) &&
  /\b(canPurchaseInApp|refuseNativePurchase|blocksPurchaseUrl|refusesPurchaseApproval)\(/.test(
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
      "hooks/queries/use-org-checkout.ts",
      "useOrgCheckout",
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

describe("a paid create's checkout", () => {
  it("refuses in the store apps before it reaches the tracker", () => {
    const source = body("hooks/queries/use-org-checkout.ts", "useOrgCheckout");
    const resume = source.indexOf("const resume = useCallback(");
    const refusal = source.indexOf("if (refuseNativePurchase(", resume);
    const run = source.indexOf("return begin(", resume);
    ok(
      resume >= 0 && refusal > resume,
      "resume never asks the purchase policy",
    );
    ok(run > refusal, "resume reaches the tracker before the refusal");
  });
});

const OWNER_UPGRADE_COPY =
  /degrade\.(owner|member|writeBlocked)|status\.(askOwner|writeLocked)|billing\.askOwner|askOwner(Hint|Label)|sidebar\.askOwner|limitBodyMember|freeTakenInline|inviteInbox\.errors\.\$\{|shareViaTeam\.moveFailed\.\$\{/;

const OWNER_UPGRADE_SURFACES = [
  "components/agent/share-via-team-failed-steps.tsx",
  "components/agent/use-share-create-team.ts",
  "components/organization/billing-plan-action.tsx",
  "components/shell/plan-composer-state.tsx",
  "components/shell/plan-upgrade-row.tsx",
  "components/shell/provider-error-cards/plan-limit.tsx",
  "components/shell/team-status-banner.tsx",
  "components/team-view/team-move-flow.tsx",
  "hooks/queries/use-invites.ts",
  "hooks/use-org-write-lock.ts",
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
