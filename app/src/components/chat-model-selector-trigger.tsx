/**
 * The model selector trigger's provider glyph, shared by the interactive and
 * read-only variants. `colored` renders the provider's full-color brand mark
 * (the routine screen's Model field asked for it); default keeps the chat
 * composer's quiet monochrome glyph. Null when no provider is selected — the
 * label then stands alone.
 */

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
