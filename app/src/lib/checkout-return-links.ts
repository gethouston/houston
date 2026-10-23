/** Tauri can fire one live deep-link event twice; repeats inside this merge. */
export const LIVE_LINK_REPEAT_MS = 1_500;

/**
 * Which checkout deep links to act on. The OS answers the cold-start read with
 * the launching link for the whole run, so every shell remount reads it again:
 * each launch link lands once per run. A live event is a fresh return (a second
 * cancel for the same org looks identical), so each one lands, except the same
 * link again within `LIVE_LINK_REPEAT_MS`, which also covers the launch link
 * arriving as an event right after the cold-start read.
 */
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
