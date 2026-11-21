export const OFFER_TOOL_NAMES = [
  "suggest_actions",
  "suggest_reusable",
] as const;

export type OfferToolName = (typeof OFFER_TOOL_NAMES)[number];

export function isOfferToolName(name: string): boolean {
  const bare = name.replace(/^mcp__.+?__/, "");
  return (OFFER_TOOL_NAMES as readonly string[]).includes(bare);
}
