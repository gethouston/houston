import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { webhookChipView } from "../src/components/agent/webhook-chip-view.ts";
import { classifyQuietError } from "../src/lib/quiet-error-class.ts";
import { webhookKeyOwnership } from "../src/lib/webhook-key-ownership.ts";
import { showWebhookNotCreatorToast } from "../src/lib/webhook-not-creator-toast.ts";
import en from "../src/locales/en/routines.json" with { type: "json" };
import es from "../src/locales/es/routines.json" with { type: "json" };
import pt from "../src/locales/pt/routines.json" with { type: "json" };
import { useUIStore } from "../src/stores/ui.ts";

const SRC = join(import.meta.dirname, "../src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

function refusal(): Error {
  return Object.assign(new Error("HTTP 403"), {
    name: "HoustonEngineError",
    status: 403,
    body: {
      error:
        "only the routine's creator can create or rotate its webhook address",
      code: "not_creator",
    },
  });
}

const drain = () => {
  for (const t of useUIStore.getState().toasts)
    useUIStore.getState().dismissToast(t.id);
};
afterEach(drain);

describe("webhookChipView: who sees which action", () => {
  it("the creator gets create or rotate by state", () => {
    const needs = webhookChipView("needs_key", "allowed");
    ok(needs.showCreate && !needs.showRotate && needs.notice === null);
    const active = webhookChipView("active", "allowed");
    ok(active.active && active.showRotate && active.notice === null);
  });

  it("anyone else still sees the state, with a line naming who can, and no action", () => {
    const needs = webhookChipView("needs_key", "not_creator");
    deepStrictEqual(
      [needs.showCreate, needs.showRotate, needs.notice],
      [false, false, "creator_only"],
    );
    const active = webhookChipView("active", "not_creator");
    deepStrictEqual(
      [active.active, active.showRotate, active.notice],
      [true, false, "creator_only"],
    );
    strictEqual(webhookChipView("needs_key", "not_owner").notice, "owner_only");
    strictEqual(webhookChipView("active", "not_owner").notice, "owner_only");
  });

  it("while access is unknown nothing is offered and nothing is claimed", () => {
    for (const state of ["needs_key", "active"] as const) {
      const view = webhookChipView(state, "unknown");
      ok(!view.showCreate && !view.showRotate && view.notice === null);
    }
    strictEqual(webhookChipView("active", "unknown").active, true);
  });

  it("checking and alert states never carry an action or the line", () => {
    for (const access of [
      "allowed",
      "not_creator",
      "not_owner",
      "unknown",
    ] as const) {
      ok(webhookChipView("checking", access).checking);
      ok(webhookChipView("alert", access).alert);
      for (const state of ["checking", "alert"] as const) {
        const view = webhookChipView(state, access);
        ok(!view.showCreate && !view.showRotate && view.notice === null);
      }
    }
  });
});

describe("webhookKeyOwnership: whether the viewer owns the space, or unknown", () => {
  const team = "org:0123456789abcdef";
  it("is unknown while capabilities load, failed to load, or no space is active", () => {
    const caps = { multiplayer: true, role: "owner" as const };
    strictEqual(
      webhookKeyOwnership({
        capabilities: caps,
        capabilitiesLoading: true,
        workspaceId: team,
      }),
      undefined,
    );
    strictEqual(
      webhookKeyOwnership({
        capabilities: null,
        capabilitiesLoading: false,
        workspaceId: team,
      }),
      undefined,
    );
    strictEqual(
      webhookKeyOwnership({
        capabilities: caps,
        capabilitiesLoading: false,
        workspaceId: null,
      }),
      undefined,
    );
  });

  it("in a team space only the owner role owns it", () => {
    for (const [role, owns] of [
      ["owner", true],
      ["admin", false],
      ["user", false],
    ] as const)
      strictEqual(
        webhookKeyOwnership({
          capabilities: { multiplayer: true, spaces: true, role },
          capabilitiesLoading: false,
          workspaceId: team,
        }),
        owns,
        role,
      );
  });

  it("a personal space and a single-player host are the viewer's own", () => {
    strictEqual(
      webhookKeyOwnership({
        capabilities: { multiplayer: true, spaces: true, role: "user" },
        capabilitiesLoading: false,
        workspaceId: "personal",
      }),
      true,
    );
    strictEqual(
      webhookKeyOwnership({
        capabilities: { multiplayer: false },
        capabilitiesLoading: false,
        workspaceId: "personal",
      }),
      true,
    );
  });
});

describe("the chip binds the SDK's rule and the three locales carry the copy", () => {
  it("renders from webhookChipView fed by useWebhookKeyAccess", () => {
    const chip = read("components/agent/webhook-activation-chip.tsx");
    ok(chip.includes("useWebhookKeyAccess(createdBy)"));
    ok(
      chip.includes("webhookChipView(webhookActivationState(status), access)"),
    );
    ok(chip.includes("view.showCreate") && chip.includes("view.showRotate"));
    ok(
      chip.includes('t("webhook.creatorOnly")') &&
        chip.includes('t("webhook.ownerOnly")'),
    );
    const hook = read("hooks/use-webhook-key-access.ts");
    ok(
      hook.includes("webhookKeyAccess({") &&
        hook.includes("webhookKeyOwnership({"),
    );
    ok(
      read("components/agent/routine-activation-chip.tsx").includes(
        "createdBy={routine.created_by}",
      ),
    );
  });

  it("en, es and pt all carry the line and the toast, without em dashes", () => {
    for (const [lang, bundle] of Object.entries({ en, es, pt })) {
      const webhook = (bundle as { webhook: Record<string, unknown> }).webhook;
      for (const key of [
        "creatorOnly",
        "creatorOnlyTitle",
        "creatorOnlyBody",
      ]) {
        const value = webhook[key];
        ok(typeof value === "string" && value.length > 0, `${lang}: ${key}`);
        ok(!value.includes("—"), `${lang}: ${key} has an em dash`);
      }
    }
  });
});

describe("the not_creator refusal is a quiet expected class", () => {
  it("is classified as webhook_not_creator; another 403 is not", () => {
    strictEqual(classifyQuietError(refusal()), "webhook_not_creator");
    const foreign = Object.assign(new Error("HTTP 403"), {
      status: 403,
      body: { error: "not assigned", code: "not_assigned" },
    });
    strictEqual(classifyQuietError(foreign), null);
  });

  it("surfaces as one info toast with the authored copy", () => {
    showWebhookNotCreatorToast();
    const toasts = useUIStore.getState().toasts;
    strictEqual(toasts.length, 1);
    strictEqual(toasts[0]?.variant, "info");
    ok(
      toasts[0]?.title === en.webhook.creatorOnlyTitle ||
        toasts[0]?.title === "routines:webhook.creatorOnlyTitle",
    );
    const surface = read("lib/quiet-state-surface.ts");
    const at = surface.indexOf('case "webhook_not_creator":');
    ok(at !== -1, "the quiet surface owns the class");
    ok(
      surface.slice(at).includes("showWebhookNotCreatorToast();") &&
        !surface
          .slice(at, surface.indexOf("case", at + 1))
          .includes("reportQuietError"),
      "the toast is the whole surface: no report",
    );
  });

  it("every reporting path skips it before any capture", () => {
    const report = read("lib/error-report.ts");
    const body = report.slice(report.indexOf("export function reportError("));
    const skip = body.indexOf('quiet === "webhook_not_creator"');
    ok(skip !== -1 && skip < body.indexOf("reportQuietError("), "reportError");
    ok(skip < body.indexOf("sentryCapture("), "no per-event capture");
    const toast = read("lib/error-toast.ts");
    ok(
      toast.includes(
        "surfaceQuietState(quiet, command, message, originalError)",
      ),
      "showErrorToast hands quiet classes to the surface",
    );
  });
});
