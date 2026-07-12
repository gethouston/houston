import { Switch } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/** Team-only opt-in for publishing the endpoint through the managed gateway. */
export function ShareEndpointToggle({
  id = "lm-share",
  checked,
  onChange,
  disabled,
}: {
  id?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("providers");
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-secondary px-3 py-2.5">
      <label
        htmlFor={id}
        className="flex min-w-0 flex-1 cursor-pointer flex-col"
      >
        <span className="text-[13px] font-medium text-foreground">
          {t("localModel.share.label")}
        </span>
        <span className="text-[11px] leading-relaxed text-muted-foreground">
          {t("localModel.share.help")}
        </span>
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="mt-0.5"
      />
    </div>
  );
}
