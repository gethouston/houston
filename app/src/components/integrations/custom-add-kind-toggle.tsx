import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { CustomAddForm } from "./custom-add-model";

const KINDS = ["openapi", "mcp"] as const;

/**
 * The manual add form's API-vs-MCP picker. Toggle BUTTONS, not ARIA radios:
 * the radio pattern demands roving tabindex + arrow keys, which two plain tab
 * stops cannot honor — `aria-pressed` states the selection honestly instead.
 * Both options are always visible (nothing gated on hover), and the selected
 * one carries the filled variant so the choice reads without colour.
 */
export function CustomAddKindToggle({
  value,
  onChange,
}: {
  value: CustomAddForm["kind"];
  /** Changing the kind invalidates any detect verdict — the parent clears it. */
  onChange: (kind: CustomAddForm["kind"]) => void;
}) {
  const { t } = useTranslation("integrations");
  return (
    <fieldset
      aria-label={t("custom.add.kindLabel")}
      className="flex gap-2 border-0 p-0"
    >
      {KINDS.map((kind) => (
        <Button
          key={kind}
          type="button"
          aria-pressed={value === kind}
          size="sm"
          variant={value === kind ? "default" : "outline"}
          onClick={() => onChange(kind)}
        >
          {t(kind === "openapi" ? "custom.badge.api" : "custom.badge.mcp")}
        </Button>
      ))}
    </fieldset>
  );
}
