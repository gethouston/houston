export const GATEWAY_MODEL_ALIASES = {
  opencode: {
    "mimo-v2.5-free": "mimo-v2.6-flash-free",
    "claude-sonnet-4": "claude-sonnet-4-6",
    "nemotron-3-ultra-free": "nemotron-3.5-super-vl-free",
    "glm-5.1": "glm-5.3",
    "glm-5.2": "glm-5.3",
  },
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
