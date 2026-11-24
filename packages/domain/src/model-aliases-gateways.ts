/**
 * The model renames of the open-catalog OpenCode gateways, spread into
 * `MODEL_ALIASES` (`./model-aliases.ts`). A dependency-free LEAF, reached
 * through the `@houston/domain/model-aliases-gateways` subpath for the same
 * plain `node --experimental-strip-types` reason as its parent.
 *
 * An open-catalog gateway carries ONLY renames (see `canonicalModelId`): a
 * gateway id with no successor keeps passing through, because the gateway, not
 * this table, is the authority on what it routes.
 */
export const GATEWAY_MODEL_ALIASES = {
  // `mimo-v2.5-free` is `mimo-v2.6-flash-free` in pi 0.87.1: the same free
  // tier (zero cost, text+image, 200k window), so the map holds the tier.
  // pi 1.4.0 dropped `claude-sonnet-4`; Sonnet 4.6 costs the same per token.
  // pi 1.5.0 dropped `nemotron-3-ultra-free`; Nemotron 3.5 Super VL is
  // NVIDIA's free successor with the same 1M window. Zen's `deepseek-v4-flash`
  // gets no row: V4.1 Flash costs 4.3x more per output token.
  // pi 1.6.0 dropped GLM-5.1 and GLM-5.2; GLM-5.3 has their exact price.
  // `glm-5` gets no row: GLM-5.3 costs 1.4x more.
  opencode: {
    "mimo-v2.5-free": "mimo-v2.6-flash-free",
    "claude-sonnet-4": "claude-sonnet-4-6",
    "nemotron-3-ultra-free": "nemotron-3.5-super-vl-free",
    "glm-5.1": "glm-5.3",
    "glm-5.2": "glm-5.3",
  },
  // Each row is a model pi dropped from OpenCode Go, mapped to its successor.
  // 0.99.1 dropped the glm, kimi and qwen rows, each to the same price tier.
  // 1.1.0 dropped the free `space-bunny-free` preview: `space-bunny` is the
  // same model (same 1M window and output cap) out of preview, so a pin on it
  // now draws plan usage. It is still the cheapest runnable home; with no row
  // the pin would fall to the GLM default, which costs about 9x more.
  // 1.3.0 dropped four rows, each for its next version at the same price.
  // deepseek-v4.1-flash also takes images, so the vision pin keeps them.
  // 1.4.0 dropped `space-bunny`; deepseek-v4.1-flash has its exact price,
  // window and image input, so both Space Bunny ids land there.
  // 1.5.0 dropped two previews for the same model's GA row: MiniMax M3.1
  // Flash (now plan usage, like Space Bunny) and Gemini 4 Argon (half price).
  // 1.6.0 dropped GLM-5.2 for GLM-5.3 at the same price and window, so the
  // older GLM-5.1 pin moves on to it too.
  "opencode-go": {
    "glm-5.1": "glm-5.3",
    "glm-5.2": "glm-5.3",
    "kimi-k2.6": "kimi-k2.7-code",
    "qwen3.7-max": "qwen3.8-max",
    "space-bunny-free": "deepseek-v4.1-flash",
    "space-bunny": "deepseek-v4.1-flash",
    "deepseek-v4-flash": "deepseek-v4.1-flash",
    "deepseek-v4-flash-vision-exp": "deepseek-v4.1-flash",
    "minimax-m2.7": "minimax-m3",
    "grok-4.6": "grok-4.7",
    "minimax-m3.1-flash-free": "minimax-m3.1-flash",
    "gemini-4-argon-contributor": "gemini-4-argon",
  },
} satisfies Readonly<Record<string, Readonly<Record<string, string>>>>;
