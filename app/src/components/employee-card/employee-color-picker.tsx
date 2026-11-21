import {
  agentColorId,
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
  resolveAgentColor,
} from "@houston-ai/core";
import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmployeeColorPalette } from "./employee-color-palette";

export function EmployeeColorPicker({
  color,
  onColorChange,
}: {
  color: string | undefined;
  onColorChange: (color: string) => void;
}) {
  const { t } = useTranslation("shell");
  const colorName = t(`sidebar.colorLabels.${agentColorId(color)}`);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const palette = useRef<HTMLDivElement>(null);
  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          aria-label={t("employeeCard.changeColor", { color: colorName })}
          className="flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-1 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus md:py-0.5"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs text-ink/70">{t("sidebar.color")}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink">
              <span
                aria-hidden="true"
                style={{ backgroundColor: resolveAgentColor(color) }}
                className="size-3 shrink-0 rounded-full"
              />
              <span className="min-w-0 break-words">{colorName}</span>
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-ink-muted"
          />
        </button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        title={t("sidebar.color")}
        aria-label={t("sidebar.color")}
        align="start"
        className="w-72 rounded-2xl border-line bg-popover p-4 shadow-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          palette.current
            ?.querySelector<HTMLButtonElement>('[role="radio"][tabindex="0"]')
            ?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        <div ref={palette} className="mx-auto max-w-xs p-4 md:p-0">
          <p className="mb-2 hidden text-sm font-medium text-ink md:block">
            {t("sidebar.color")}
          </p>
          <EmployeeColorPalette color={color} onColorChange={onColorChange} />
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}
