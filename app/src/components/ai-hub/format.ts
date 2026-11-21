import type {
  CatalogModel,
  CatalogOffer,
  LabId,
} from "../../lib/ai-hub/catalog-types.ts";

export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) return "";
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${trimTrailingZeros(millions.toFixed(1))}M`;
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(Math.round(tokens));
}

export function formatPrice(dollarsPerMillion: number | undefined): string {
  if (dollarsPerMillion == null || !Number.isFinite(dollarsPerMillion)) {
    return "";
  }
  if (dollarsPerMillion === 0) return "$0";
  const decimals = dollarsPerMillion < 1 ? 3 : 2;
  let str = trimTrailingZeros(dollarsPerMillion.toFixed(decimals));
  const [whole, frac] = str.split(".");
  if (frac?.length === 1) str = `${whole}.${frac}0`;
  return `$${str}`;
}

export function formatReleaseDate(
  iso: string | undefined,
  locale: string,
): string {
  if (!iso) return "";
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

export function roundedModelCount(count: number): number {
  return Math.floor(count / 50) * 50;
}

export function fewModels(count: number): boolean {
  return roundedModelCount(count) < 100;
}

export function capabilityKeys(
  model: CatalogModel,
): ("reasoning" | "images")[] {
  const keys: ("reasoning" | "images")[] = [];
  if (model.reasoning) keys.push("reasoning");
  if (model.inputModalities.includes("image")) keys.push("images");
  return keys;
}

export function labName(lab: LabId): string {
  return LAB_NAMES[lab];
}

export function modelMarkId(model: CatalogModel): string {
  return model.lab;
}

const LAB_NAMES: Record<LabId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  meta: "Meta",
  mistral: "Mistral",
  qwen: "Qwen",
  deepseek: "DeepSeek",
  xai: "xAI",
  amazon: "Amazon",
  minimax: "MiniMax",
  zai: "Z.ai",
  moonshot: "Moonshot",
  cohere: "Cohere",
  nvidia: "NVIDIA",
  other: "Other",
};

export function sortOffers(
  offers: readonly CatalogOffer[],
  isConnected: (offer: CatalogOffer) => boolean,
): CatalogOffer[] {
  return [...offers].sort((a, b) => {
    const connected = rank(isConnected(a)) - rank(isConnected(b));
    if (connected !== 0) return connected;
    const subscription = rank(a.subscription) - rank(b.subscription);
    if (subscription !== 0) return subscription;
    const priceA = a.costInput ?? Number.POSITIVE_INFINITY;
    const priceB = b.costInput ?? Number.POSITIVE_INFINITY;
    return priceA - priceB;
  });
}

function rank(flag: boolean): number {
  return flag ? 0 : 1;
}

function trimTrailingZeros(value: string): string {
  return value.includes(".")
    ? value.replace(/0+$/, "").replace(/\.$/, "")
    : value;
}
