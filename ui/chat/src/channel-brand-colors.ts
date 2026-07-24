/**
 * Genuine third-party messaging-channel brand colors, centralized so no raw hex
 * sits inline in JSX. These are official brand-identity values (Slack aubergine,
 * Telegram blue, the four Slack-logo lozenge colors) — NOT Houston UI colors, so
 * they deliberately do NOT map to design tokens and never track the theme. Same
 * precedent as `app/src/components/shell/provider-brand-colors.ts`: the token
 * rule (`bg-chip`, `text-ink`, ...) stays in force EVERYWHERE else.
 */

/** Circular badge fill behind each channel logo. */
export const CHANNEL_BADGE_FILL = {
  telegram: "#2AABEE",
  slack: "#4A154B",
} as const;

/** The four Slack-logo lozenge colors (official brand palette). */
export const SLACK_LOGO_COLORS = {
  rose: "#E01E5A",
  blue: "#36C5F0",
  green: "#2EB67D",
  yellow: "#ECB22E",
} as const;
