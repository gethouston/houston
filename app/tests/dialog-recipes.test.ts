import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

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
      const text = source(path);
      assert.ok(!/sm:max-w-/.test(text), `${path} picks its own width`);
      assert.ok(!/\bh-\[/.test(text), `${path} picks its own height`);
    });

    it(`${path} builds its controls from the Button primitive`, () => {
      assert.ok(
        !/<button[\s>]/.test(source(path)),
        `${path} hand-rolls a <button> where the Button primitive belongs`,
      );
    });
  }
});
