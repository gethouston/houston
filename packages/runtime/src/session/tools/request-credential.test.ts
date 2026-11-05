import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import {
  type CredentialTargetStatus,
  makeRequestCredentialTool,
  REQUEST_CREDENTIAL_TOOL_NAME,
} from "./request-credential";

/**
 * The secure key-entry hand-off tool, with its PRODUCT-1292 pre-flight: a
 * credential step is recorded ONLY for a slug the host actually has a
 * definition for. Before the check, a model-invented slug (or one whose add
 * failed) queued a card that rendered fine while every save 404ed — a
 * user-facing dead end the agent never heard about ("Save key" looked like it
 * did nothing).
 */

const ctx = {} as unknown as ExtensionToolContext;

function toolWith(
  status: (
    slug: string,
    signal: AbortSignal | undefined,
  ) => Promise<CredentialTargetStatus | null>,
) {
  const tool = makeRequestCredentialTool({ status });
  return (params: unknown) =>
    tool.execute("id", params as never, undefined, undefined, ctx);
}

test("is named request_credential", () => {
  expect(makeRequestCredentialTool({ status: async () => null }).name).toBe(
    REQUEST_CREDENTIAL_TOOL_NAME,
  );
});

test("records the credential step for a slug the host knows (normalized to lower case)", async () => {
  const status = vi.fn(
    async (): Promise<CredentialTargetStatus | null> => ({
      state: { status: "pending" },
    }),
  );
  const run = toolWith(status);
  const holder = newInteractionHolder();
  const out = await runWithInteractionCapture(holder, () =>
    run({ toolkit: "  Acme_CRM ", reason: "To sync your records." }),
  );
  expect(status).toHaveBeenCalledWith("acme_crm", undefined, ctx);
  expect(holder.pending).toEqual({
    steps: [
      {
        kind: "credential",
        id: "k1",
        toolkit: "acme_crm",
        reason: "To sync your records.",
      },
    ],
  });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/end your turn/i);
  // The check that closes the setup rides on this result, because the turn
  // that starts when the key arrives has no other copy of it.
  expect(text).toContain(
    "verify it with one harmless read-only action (find one with integration_search, run it with integration_execute",
  );
});

test("refuses a slug with NO definition — the exact PRODUCT-1292 family — and records nothing", async () => {
  const run = toolWith(async () => null);
  const holder = newInteractionHolder();
  await expect(
    runWithInteractionCapture(holder, () => run({ toolkit: "typeform" })),
  ).rejects.toThrow(/No custom integration 'typeform'/);
  await expect(
    runWithInteractionCapture(holder, () => run({ toolkit: "typeform" })),
  ).rejects.toThrow(/custom_integration_add/);
  expect(holder.pending).toBeUndefined();
});

test("refuses a definition in error state with the repair path and records nothing", async () => {
  const run = toolWith(async () => ({
    state: { status: "error", message: "spec failed to compile" },
  }));
  const holder = newInteractionHolder();
  await expect(
    runWithInteractionCapture(holder, () => run({ toolkit: "acme" })),
  ).rejects.toThrow(/spec failed to compile/);
  expect(holder.pending).toBeUndefined();
});

test("relays a lookup transport failure instead of queueing a card blind", async () => {
  const run = toolWith(async () => {
    throw new Error("custom integration status failed (503): not configured");
  });
  const holder = newInteractionHolder();
  await expect(
    runWithInteractionCapture(holder, () => run({ toolkit: "acme" })),
  ).rejects.toThrow(/status failed \(503\)/);
  expect(holder.pending).toBeUndefined();
});

test("still rejects an empty toolkit before any lookup", async () => {
  const status = vi.fn(async () => null);
  const run = toolWith(status);
  await expect(run({ toolkit: "   " })).rejects.toThrow(/non-empty toolkit/);
  expect(status).not.toHaveBeenCalled();
});
