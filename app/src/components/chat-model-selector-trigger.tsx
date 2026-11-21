import { BrandMark } from "./provider-browser/brand-mark";
import { ProviderGlyph } from "./shell/provider-logos";

export function ModelTriggerGlyph({
  provider,
  colored,
}: {
  provider: string;
  colored?: boolean;
}) {
  if (!provider) return null;
  if (colored) {
    return (
      <BrandMark
        providerId={provider}
        size="sm"
        className="size-3.5 [&_svg]:size-full [&_svg]:text-current!"
      />
    );
  }
  return (
    <span className="inline-flex size-3.5 items-center justify-center [&_svg]:size-full">
      <ProviderGlyph providerId={provider} />
    </span>
  );
}
