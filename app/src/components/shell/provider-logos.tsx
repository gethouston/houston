import type { ReactElement } from "react";
import type { LogoProps } from "./provider-glyph-svg.tsx";
import {
  type BrandKey,
  monogramText,
  providerBrandKey,
} from "./provider-logo-map.ts";
import {
  AmazonBedrockLogo,
  AnthropicLogo,
  AzureLogo,
  CerebrasLogo,
  CloudflareLogo,
  CohereLogo,
  DeepSeekLogo,
  FireworksLogo,
  GitHubCopilotLogo,
  GoogleLogo,
  GoogleVertexLogo,
  GroqLogo,
  HuggingFaceLogo,
  LocalModelLogo,
  MetaLogo,
  MiniMaxLogo,
} from "./provider-marks.tsx";
import {
  MistralLogo,
  MoonshotLogo,
  NvidiaLogo,
  OpenAILogo,
  OpenCodeGoLogo,
  OpenCodeLogo,
  OpenRouterLogo,
  QwenLogo,
  TogetherLogo,
  VercelLogo,
  XaiLogo,
  XiaomiLogo,
  ZaiLogo,
} from "./provider-marks-extra.tsx";

const BRAND_LOGOS: Record<BrandKey, (props?: LogoProps) => ReactElement> = {
  anthropic: AnthropicLogo,
  cohere: CohereLogo,
  meta: MetaLogo,
  qwen: QwenLogo,
  openai: OpenAILogo,
  google: GoogleLogo,
  "google-vertex": GoogleVertexLogo,
  "github-copilot": GitHubCopilotLogo,
  openrouter: OpenRouterLogo,
  "amazon-bedrock": AmazonBedrockLogo,
  opencode: OpenCodeLogo,
  "opencode-go": OpenCodeGoLogo,
  "openai-compatible": LocalModelLogo,
  deepseek: DeepSeekLogo,
  minimax: MiniMaxLogo,
  mistral: MistralLogo,
  groq: GroqLogo,
  cerebras: CerebrasLogo,
  huggingface: HuggingFaceLogo,
  "cloudflare-workers-ai": CloudflareLogo,
  "cloudflare-ai-gateway": CloudflareLogo,
  xai: XaiLogo,
  vercel: VercelLogo,
  nvidia: NvidiaLogo,
  together: TogetherLogo,
  moonshotai: MoonshotLogo,
  zai: ZaiLogo,
  fireworks: FireworksLogo,
  xiaomi: XiaomiLogo,
  "azure-openai-responses": AzureLogo,
};

/**
 * The brand mark for a provider id / lab id, or `null` when it has none. Callers
 * pair this with `<Monogram>` for the fallback: `providerLogo(id) ?? <Monogram
 * seed={...} />`. `className` overrides the mark's default 20px box.
 */
export function providerLogo(
  id: string,
  className?: string,
): ReactElement | null {
  const key = providerBrandKey(id);
  return key ? BRAND_LOGOS[key]({ className }) : null;
}

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

export function ProviderGlyph({
  providerId,
  className,
}: {
  providerId: string;
  className?: string;
}) {
  return (
    providerLogo(providerId, className) ?? (
      <Monogram className={className} seed={providerId} />
    )
  );
}
