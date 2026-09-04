import { AGENT_COLORS, cn, colorValue } from "@houston-ai/core";
import { Check } from "lucide-react";

/**
 * The agent color swatches of the naming step: two rows of five on a phone
 * (ten swatches outgrow the card in one row), the single row at md+.
 */
export function AgentColorPalette({
  color,
  onColorChange,
}: {
  color: string | undefined;
  onColorChange: (value: string) => void;
}) {
  return (
    <div className="mb-6 grid grid-cols-5 gap-2 md:flex md:items-center">
      {AGENT_COLORS.map((c) => {
        const swatch = colorValue(c);
        const isSelected =
          color === c.id || color === c.light || color === c.dark;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onColorChange(c.id)}
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center transition-all duration-150",
              isSelected
                ? "ring-2 ring-offset-2 ring-ink/30"
                : "hover:scale-110",
            )}
            style={{ backgroundColor: swatch }}
          >
            {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
          </button>
        );
      })}
    </div>
  );
}
