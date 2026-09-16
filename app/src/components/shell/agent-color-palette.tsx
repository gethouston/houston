import { AGENT_COLORS, agentColorId, cn, colorValue } from "@houston-ai/core";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The ten agent colors, in wheel order. Two rows of five on a phone (ten
 * swatches outgrow the dialog in one row), one centred row at md+ — where the
 * gap is the width the tenth swatch needs to stand at full size inside the
 * naming column, rather than being shrunk to fit it.
 *
 * The swatch is 28px but the control around it is a full 44px on a phone: a
 * colour dot is the smallest thing on the screen and the easiest one to miss
 * with a thumb, so the target is bigger than the paint.
 */
export function AgentColorPalette({
  color,
  onColorChange,
}: {
  color: string | undefined;
  onColorChange: (value: string) => void;
}) {
  const { t } = useTranslation("shell");
  const selected = color ? agentColorId(color) : null;

  return (
    <fieldset className="grid grid-cols-5 justify-items-center gap-1 md:flex md:justify-center md:gap-1.5">
      <legend className="sr-only">{t("sidebar.color")}</legend>
      {AGENT_COLORS.map((entry) => {
        const isSelected = entry.id === selected;
        return (
          <button
            key={entry.id}
            type="button"
            aria-pressed={isSelected}
            aria-label={t(`sidebar.colorLabels.${entry.id}`)}
            onClick={() => onColorChange(entry.id)}
            className="group flex size-11 items-center justify-center rounded-full outline-none transition-transform duration-200 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-focus md:size-8"
          >
            <span
              aria-hidden="true"
              style={{ backgroundColor: colorValue(entry) }}
              className={cn(
                "flex size-7 items-center justify-center rounded-full transition-transform duration-200",
                isSelected
                  ? "ring-2 ring-ink/40 ring-offset-2 ring-offset-dialog"
                  : "group-hover:scale-110",
              )}
            >
              {isSelected && <Check className="size-3.5 text-white" />}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
