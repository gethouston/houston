import { durationMs } from "@houston/design-tokens";
import { AGENT_COLORS, agentColorId, cn, colorValue } from "@houston-ai/core";
import { Check } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import { useTranslation } from "react-i18next";
import { paletteColumns, paletteKeyStep } from "./employee-card-model";

/** Ten colors in two rows of five, with one tab stop and arrow selection. */
export function EmployeeColorPalette({
  color,
  labelledBy,
  className,
  onColorChange,
}: {
  color: string | undefined;
  /** The id of a visible label naming the group; without one it is named
   *  "Color" on its own. */
  labelledBy?: string;
  className?: string;
  onColorChange: (color: string) => void;
}) {
  const { t } = useTranslation("shell");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = color ? agentColorId(color) : null;
  const selectedIndex = AGENT_COLORS.findIndex((c) => c.id === selected);
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tops = buttons.current.map((node) => node?.offsetTop ?? 0);
    const next = paletteKeyStep(
      event.key,
      tabStop,
      AGENT_COLORS.length,
      paletteColumns(tops),
    );
    if (next === null) return;
    event.preventDefault();
    onColorChange(AGENT_COLORS[next].id);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : t("sidebar.color")}
      onKeyDown={onKeyDown}
      className={cn("grid grid-cols-5 justify-items-center gap-1", className)}
    >
      {AGENT_COLORS.map((entry, index) => {
        const isSelected = entry.id === selected;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a swatch is a painted target larger than its dot, which a native radio cannot draw; radio semantics come from role + aria-checked + the roving tabindex the arrow keys walk.
          <button
            key={entry.id}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={t(`sidebar.colorLabels.${entry.id}`)}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => onColorChange(entry.id)}
            style={{ transitionDuration: `${durationMs.fast}ms` }}
            className="flex size-11 items-center justify-center rounded-full outline-none transition-transform motion-reduce:transition-none active:scale-[0.96] motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span
              aria-hidden="true"
              style={{ backgroundColor: colorValue(entry) }}
              className={cn(
                "flex size-6 items-center justify-center rounded-full",
                isSelected && "outline-2 outline-offset-2 outline-ink/40",
              )}
            >
              {isSelected && (
                <Check className="size-4 text-bubble-text dark:text-gutter" />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
