export const LIVE_LINK_REPEAT_MS = 1_500;

export function createCheckoutLinkGate(now: () => number) {
  const launched = new Set<string>();
  let last: { link: string; at: number } | null = null;
  const repeat = (link: string): boolean => {
    const at = now();
    const seen = last?.link === link && at - last.at < LIVE_LINK_REPEAT_MS;
    last = { link, at };
    return seen;
  };
  return {
    launch(link: string): boolean {
      if (launched.has(link)) return false;
      launched.add(link);
      return !repeat(link);
    },
    live(link: string): boolean {
      return !repeat(link);
    },
  };
}
