export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function fmtCost(n: number): string {
  if (n === 0) return "$0.00";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

/**
 * Human-readable model label for the filter dropdown.
 *
 * Handles the ids Houston's picker produces (providers.ts): Claude full ids,
 * the OpenAI `gpt-5.5` id, and the legacy `sonnet`/`opus` shorthands that older
 * configs may still hold. Anything else is title-cased as a safe fallback.
 */
export function shortModel(model: string): string {
  // Claude full id: "claude-sonnet-4-6" → "Sonnet 4.6"
  const claude = model.match(/^claude-([a-z]+)-(\d[\d-]*)$/i);
  if (claude) {
    const name = claude[1].charAt(0).toUpperCase() + claude[1].slice(1);
    return `${name} ${claude[2].replace(/-/g, ".")}`;
  }
  // OpenAI version id: "gpt-5.5" → "GPT-5.5"
  const gpt = model.match(/^gpt-(\d[\d.]+)$/i);
  if (gpt) return `GPT-${gpt[1]}`;
  // Legacy shorthand ("sonnet", "opus"): capitalise first letter.
  return model.charAt(0).toUpperCase() + model.slice(1);
}
