/**
 * Additional provider brand marks beyond the original ten (groq, mistral, xai,
 * cerebras, fireworks, together, nvidia, huggingface, moonshotai, zai, vercel,
 * cloudflare). Every one is an ORIGINAL geometric or monogram-style glyph
 * authored in Houston's mark style via the shared `Glyph` wrapper: they evoke
 * each brand WITHOUT reproducing any trademarked or copyrighted logo artwork or
 * copied SVG paths. Consumed via the `BRAND_LOGOS` registry in
 * `provider-logos.tsx`.
 */
import { Glyph, type LogoProps } from "./provider-glyph-svg.tsx";

/** Groq — an open ring with an inward bar (a "G" read at a glance). */
export const GroqLogo = ({ className }: LogoProps = {}) => (
  <Glyph
    label="Groq logo"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
  >
    <path d="M19.5 12A7.5 7.5 0 1 1 16 5.6" />
    <path d="M19.5 12H13" />
  </Glyph>
);

/** Mistral — a stepped grid of tiles evoking its banded tile mark. */
export const MistralLogo = ({ className }: LogoProps = {}) => (
  <Glyph label="Mistral logo" className={className}>
    <path d="M4 5h3v3H4zM10.5 5h3v3h-3zM17 5h3v3h-3zM4 10.5h3v3H4zM10.5 10.5h3v3h-3zM17 10.5h3v3h-3zM4 16h3v3H4zM17 16h3v3h-3z" />
  </Glyph>
);

/** xAI — a clean geometric X. */
export const XaiLogo = ({ className }: LogoProps = {}) => (
  <Glyph
    label="xAI logo"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
  >
    <path d="M5 5 19 19M19 5 5 19" />
  </Glyph>
);

/** Cerebras — nested C-arcs suggesting parallel cores. */
export const CerebrasLogo = ({ className }: LogoProps = {}) => (
  <Glyph
    label="Cerebras logo"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path d="M18 6.5A8 8 0 1 0 18 17.5" />
    <path d="M15.5 9.5A4.2 4.2 0 1 0 15.5 14.5" />
  </Glyph>
);

/** Fireworks — a radiating spark burst. */
export const FireworksLogo = ({ className }: LogoProps = {}) => (
  <Glyph
    label="Fireworks logo"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6 8.5 8.5M15.5 15.5l2.9 2.9M18.4 5.6 15.5 8.5M8.5 15.5 5.6 18.4" />
  </Glyph>
);

/** Together — two overlapping rings (a union of models). */
export const TogetherLogo = ({ className }: LogoProps = {}) => (
  <Glyph
    label="Together logo"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <circle cx="9" cy="12" r="6" />
    <circle cx="15" cy="12" r="6" />
  </Glyph>
);

/** NVIDIA — an original inward spiral (an "eye" swirl). */
export const NvidiaLogo = ({ className }: LogoProps = {}) => (
  <Glyph
    label="NVIDIA logo"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5 6 6 0 1 0-6-6 3.5 3.5 0 1 0 3.5 3.5" />
  </Glyph>
);

/** Hugging Face — a simple smiling face (original, not the exact emoji art). */
export const HuggingFaceLogo = ({ className }: LogoProps = {}) => (
  <Glyph
    label="Hugging Face logo"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5a4.2 4.2 0 0 0 7 0" />
    <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
  </Glyph>
);

/** Moonshot AI (Kimi) — a crescent moon. */
export const MoonshotLogo = ({ className }: LogoProps = {}) => (
  <Glyph label="Moonshot AI logo" className={className}>
    <path d="M15.6 3A9 9 0 1 0 21 15.6 7 7 0 0 1 15.6 3Z" />
  </Glyph>
);

/** Z.ai (GLM) — a geometric Z. */
export const ZaiLogo = ({ className }: LogoProps = {}) => (
  <Glyph
    label="Z.ai logo"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
  >
    <path d="M6 5.5h12L6 18.5h12" />
  </Glyph>
);

/** Vercel AI Gateway — a clean upward triangle. */
export const VercelLogo = ({ className }: LogoProps = {}) => (
  <Glyph label="Vercel logo" className={className}>
    <path d="M12 4 21 20H3Z" />
  </Glyph>
);

/** Cloudflare — a simple cloud outline. */
export const CloudflareLogo = ({ className }: LogoProps = {}) => (
  <Glyph
    label="Cloudflare logo"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path d="M7.5 17.5h9a3.5 3.5 0 0 0 .4-6.98A5.5 5.5 0 0 0 6.6 9.9 3.9 3.9 0 0 0 7 17.5Z" />
  </Glyph>
);
