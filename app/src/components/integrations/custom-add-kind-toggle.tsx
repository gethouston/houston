import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { CustomAddForm } from "./custom-add-model";

const KINDS = ["openapi", "mcp"] as const;

export function CustomAddKindToggle({
  value,
  onChange,
}: {
  value: CustomAddForm["kind"];
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
