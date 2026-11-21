import type { ProviderOverride } from "./types.ts";

export const API_KEY_OVERRIDES: Record<string, ProviderOverride> = {
  groq: {
    name: "Groq",
    subtitle: "Fast inference",
    cost: "Free tier, then pay as you go",
    installUrl: "https://groq.com",
    apiKeyUrl: "https://console.groq.com/keys",
  },
  cerebras: {
    name: "Cerebras",
    subtitle: "Very fast inference",
    cost: "Free tier, then pay as you go",
    installUrl: "https://www.cerebras.ai",
    apiKeyUrl: "https://cloud.cerebras.ai",
  },
  huggingface: {
    name: "Hugging Face",
    subtitle: "Open models hub",
    cost: "Free monthly credits, then pay as you go",
    installUrl: "https://huggingface.co",
    apiKeyUrl: "https://huggingface.co/settings/tokens",
  },
  mistral: {
    name: "Mistral",
    subtitle: "La Plateforme",
    cost: "Free tier, then pay as you go",
    installUrl: "https://mistral.ai",
    apiKeyUrl: "https://console.mistral.ai/api-keys",
    models: {
      "mistral-large-4": {
        description: "Mistral's most capable model. Long context, reasoning.",
      },
    },
  },
  xai: {
    name: "xAI",
    subtitle: "Grok models",
    cost: "Pay-as-you-go on your xAI account",
    installUrl: "https://x.ai",
    apiKeyUrl: "https://console.x.ai",
  },
  zai: {
    name: "Z.ai",
    subtitle: "GLM models",
    cost: "Pay-as-you-go on your Z.ai account",
    installUrl: "https://z.ai",
    apiKeyUrl: "https://z.ai/manage-apikey/apikey-list",
  },
  nvidia: {
    name: "NVIDIA",
    subtitle: "NIM inference",
    cost: "Free credits, then pay as you go",
    installUrl: "https://build.nvidia.com",
    apiKeyUrl: "https://org.ngc.nvidia.com/setup/api-keys",
  },
  qwen: {
    name: "Qwen",
    subtitle: "Standard Model Studio API key",
    description: "Standard Model Studio key. Free quota, then pay as you go.",
    cost: "Free quota, then pay as you go",
    installUrl: "https://modelstudio.console.alibabacloud.com",
    apiKeyUrl:
      "https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key",
  },
  "qwen-token-plan": {
    name: "Qwen Token Plan (Team)",
    subtitle: "Team token plan subscription",
    description: "Needs the dedicated key from a purchased team token plan.",
    cost: "Requires a purchased team token plan",
    billing: "subscription",
    installUrl:
      "https://www.alibabacloud.com/help/en/model-studio/token-plan-team-quickstart",
    apiKeyUrl:
      "https://www.alibabacloud.com/help/en/model-studio/token-plan-team-quickstart",
  },
  "qwen-token-plan-individual": {
    name: "Qwen Token Plan (Individual)",
    subtitle: "Personal token plan subscription",
    description:
      "Needs the dedicated key from a purchased personal token plan.",
    cost: "Requires a purchased personal token plan",
    billing: "subscription",
    installUrl:
      "https://www.alibabacloud.com/help/en/model-studio/token-plan-individual-quickstart",
    apiKeyUrl:
      "https://www.alibabacloud.com/help/en/model-studio/token-plan-individual-quickstart",
  },
  "google-vertex": {
    name: "Google Vertex AI",
    subtitle: "Gemini on Google Cloud",
    cost: "Pay-as-you-go on your Google Cloud account",
    installUrl: "https://cloud.google.com/vertex-ai",
    apiKeyUrl: "https://console.cloud.google.com/apis/credentials",
  },
  fireworks: {
    name: "Fireworks",
    subtitle: "Serverless open models",
    cost: "Pay as you go",
    installUrl: "https://fireworks.ai",
    apiKeyUrl: "https://app.fireworks.ai/settings/users/api-keys",
  },
  together: {
    name: "Together AI",
    subtitle: "Open models, hosted",
    cost: "Pay as you go",
    installUrl: "https://together.ai",
    apiKeyUrl: "https://api.together.ai/settings/api-keys",
  },
  moonshotai: {
    name: "Moonshot AI",
    subtitle: "Kimi models",
    cost: "Pay as you go",
    installUrl: "https://platform.moonshot.ai",
    apiKeyUrl: "https://platform.moonshot.ai/console/api-keys",
    models: {
      "kimi-k3": {
        description: "Moonshot's frontier model. Long context, vision.",
      },
    },
  },
  "zai-coding-cn": {
    name: "Z.ai Coding (China)",
    subtitle: "GLM coding plan, China endpoint",
    cost: "Your GLM Coding plan",
    billing: "subscription",
    installUrl: "https://open.bigmodel.cn",
    apiKeyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
  },
  "azure-openai-responses": {
    name: "Azure OpenAI",
    subtitle: "OpenAI on Microsoft Azure",
    cost: "Pay-as-you-go on your Azure account",
    installUrl:
      "https://azure.microsoft.com/products/ai-services/openai-service",
    apiKeyUrl: "https://portal.azure.com",
  },
  "vercel-ai-gateway": {
    name: "Vercel AI Gateway",
    subtitle: "Many models, one key",
    cost: "Pay-as-you-go on your Vercel account",
    installUrl: "https://vercel.com/ai-gateway",
    apiKeyUrl:
      "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys%3FshowCreateKeyModal",
  },
  xiaomi: {
    name: "Xiaomi MiMo",
    subtitle: "MiMo models",
    cost: "Pay as you go",
    installUrl: "https://platform.xiaomimimo.com",
    apiKeyUrl: "https://platform.xiaomimimo.com",
  },
};
