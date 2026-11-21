import { cn } from "@houston-ai/core";
import { providerBrandColor } from "../shell/provider-brand-colors.ts";
import { ProviderGlyph } from "../shell/provider-logos.tsx";

const MARK_SIZE = {
  sm: "size-6",
  md: "size-8",
  lg: "size-10",
} as const;

export function BrandMark({
  providerId,
  size = "md",
  className,
}: {
  providerId: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const color = providerBrandColor(providerId);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center",
        MARK_SIZE[size],
        !color && "text-ink",
        className,
      )}
      style={color ? { color } : undefined}
    >
      <span className="inline-grid size-full place-items-center [&_svg]:size-full">
        <ProviderGlyph providerId={providerId} />
      </span>
    </span>
  );
}
