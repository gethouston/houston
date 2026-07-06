/**
 * Provider logo dispatch — the single front door shared by every surface that
 * shows a "which AI provider" mark (chat model picker, provider cards,
 * onboarding, reconnect/error cards, and the AI hub).
 *
 * ONE registry (`BRAND_LOGOS`) maps a `BrandKey` to its SVG mark; the pure
 * resolver in `provider-logo-map.ts` folds every provider id (and AI-hub lab id)
 * onto a key, including regional/variant ids that reuse a parent brand's art.
 * Anything with no bespoke mark renders the polished `Monogram` tile instead of
 * a bare initial, so a provider can never silently borrow the wrong brand's logo
 * and a new provider is a single map edit rather than three drifting switches.
 */
import type { ReactElement } from "react";
import type { LogoProps } from "./provider-glyph-svg.tsx";
import {
  type BrandKey,
  monogramText,
  providerBrandKey,
} from "./provider-logo-map.ts";
import {
  AmazonBedrockLogo,
  ClaudeLogo,
  DeepSeekLogo,
  GeminiLogo,
  GitHubCopilotLogo,
  LocalModelLogo,
  MiniMaxLogo,
  OpenAILogo,
  OpenCodeLogo,
  OpenRouterLogo,
} from "./provider-marks.tsx";

/** The one place a `BrandKey` binds to its mark. Exhaustive by construction. */
const BRAND_LOGOS: Record<BrandKey, (props?: LogoProps) => ReactElement> = {
  anthropic: ClaudeLogo,
  openai: OpenAILogo,
  google: GeminiLogo,
  "github-copilot": GitHubCopilotLogo,
  openrouter: OpenRouterLogo,
  "amazon-bedrock": AmazonBedrockLogo,
  opencode: OpenCodeLogo,
  "openai-compatible": LocalModelLogo,
  deepseek: DeepSeekLogo,
  minimax: MiniMaxLogo,
};

/**
 * The brand mark for a provider id / lab id, or `null` when it has none. Callers
 * pair this with `<Monogram>` for the fallback: `providerLogo(id) ?? <Monogram
 * seed={...} />`.
 */
export function providerLogo(id: string): ReactElement | null {
  const key = providerBrandKey(id);
  return key ? BRAND_LOGOS[key]() : null;
}

/**
 * The fallback tile for any provider without a bespoke mark: a rounded chip in a
 * faint `currentColor` wash with the provider's 1-2 char monogram. It draws into
 * the same 24x24 slot as the brand marks (so `[&_svg]:size-full` wrappers scale
 * it identically) and reads in light and dark because both the wash and the
 * glyph derive from the inherited text color.
 */
export function Monogram({
  seed,
  className = "h-5 w-5",
}: {
  seed: string;
  className?: string;
}) {
  const text = monogramText(seed);
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={`${seed} logo`}
    >
      <title>{seed}</title>
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        rx="6"
        fill="currentColor"
        opacity="0.12"
      />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={text.length > 1 ? 9.5 : 12}
        fontWeight="600"
        letterSpacing="-0.02em"
        fill="currentColor"
      >
        {text}
      </text>
    </svg>
  );
}

/**
 * Monochrome provider mark by id — the shared dispatcher used across chat,
 * onboarding, reconnect/error cards, and the AI hub. Resolves the id to a brand
 * mark, else falls back to the `Monogram` tile seeded from the id.
 */
export function ProviderGlyph({ providerId }: { providerId: string }) {
  return providerLogo(providerId) ?? <Monogram seed={providerId} />;
}
