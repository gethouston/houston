import {
  employeeMetalColors,
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
  resolveAgentColor,
} from "@houston-ai/core";
import { Paintbrush } from "lucide-react";
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
  const metal = employeeMetalColors(resolveAgentColor(color));
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const palette = useRef<HTMLDivElement>(null);
  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          aria-label={t("employeeCard.changeColor")}
          title={t("employeeCard.changeColor")}
          style={{
            color: metal.relief,
            background: metal.control,
            borderColor: metal.engraving,
          }}
          className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full border outline-none hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current md:size-8"
        >
          <Paintbrush aria-hidden="true" className="size-5" />
        </button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        title={t("sidebar.color")}
        aria-label={t("sidebar.color")}
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
