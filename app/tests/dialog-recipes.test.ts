import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * The small form dialogs live on ONE frame.
 *
 * `FormDialog` (`@houston-ai/core`) is the delete confirms' settled shape with
 * fields in the middle: one header, one footer, one of two widths. A dialog
 * that reassembles that frame out of `DialogContent` + `DialogHeader` +
 * `DialogFooter` drifts the moment anyone touches it — a different gap, a
 * one-off `sm:max-w-[560px]`, a Cancel on the wrong side — which is exactly
 * the sprawl the recipe ended. These files are past that point and must stay
 * there; a new form dialog belongs on the recipe too.
 *
 * Source text rather than a render: none of these modules loads under this
 * suite's `--experimental-strip-types` runner (React, the Zustand stores and
 * the i18n barrel all come with them).
 */
const MIGRATED = [
  "components/agent-actions/agent-copy-action.tsx",
  "components/agent-actions/agent-identity-dialog.tsx",
  "components/agent/webhook-key-dialog.tsx",
  "components/integrations/custom-edit-dialog.tsx",
  "components/settings/sections/api-key-create-dialog.tsx",
  "components/settings/sections/delete-account.tsx",
  "components/shell/create-organization-dialog.tsx",
  "components/shell/edit-team-identity-dialog.tsx",
  "components/shell/provider-api-key-dialog.tsx",
  "components/shell/provider-copilot-connect-dialog.tsx",
];

function source(path: string): string {
  return readFileSync(join(import.meta.dirname, "../src", path), "utf8");
}

describe("the small form dialogs sit on the FormDialog recipe", () => {
  for (const path of MIGRATED) {
    it(`${path} renders the recipe, not a hand-built frame`, () => {
      const text = source(path);
      assert.ok(
        text.includes("FormDialog"),
        `${path} must render <FormDialog>`,
      );
      for (const part of [
        "DialogContent",
        "DialogHeader",
        "DialogFooter",
        "DialogTitle",
        "DialogDescription",
      ]) {
        assert.ok(
          !text.includes(part),
          `${path} must not reassemble the frame with ${part}`,
        );
      }
    });

    it(`${path} leaves the dialog's size to the recipe`, () => {
      // Two widths, no third: a form dialog needing more room is a flow.
      // `sm:max-w-…` is the dialog-width spelling (DialogContent's unprefixed
      // cap is the phone gutter) and `h-[…]` is a dialog deciding how tall it
      // should be — both belong to the recipe alone. A plain `max-w-*` inside
      // the BODY is something else: a reading width, which is typography.
      const text = source(path);
      assert.ok(!/sm:max-w-/.test(text), `${path} picks its own width`);
      assert.ok(!/\bh-\[/.test(text), `${path} picks its own height`);
    });

    it(`${path} builds its controls from the Button primitive`, () => {
      // A raw <button> defaults to type=submit, and the recipe puts a real
      // <form> around the fields — so one among them silently became a second
      // submit control (the copy dialog's team rows saved the form with the
      // PREVIOUS team). `Button` from @houston-ai/core defaults to
      // type="button"; the form's one submit is the recipe's own primary.
      assert.ok(
        !/<button[\s>]/.test(source(path)),
        `${path} hand-rolls a <button> where the Button primitive belongs`,
      );
    });
  }
});
