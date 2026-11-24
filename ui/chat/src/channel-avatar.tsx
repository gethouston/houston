import { cn } from "@houston-ai/core";
import { CHANNEL_BADGE_FILL, SLACK_LOGO_COLORS } from "./channel-brand-colors";

export type ChannelSource = "telegram" | "slack" | "desktop" | string;

interface ChannelAvatarProps {
  source: ChannelSource;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Small branded avatar for messaging channel sources.
 * Shows the platform logo in a circular badge.
 */
export function ChannelAvatar({
  source,
  size = "sm",
  className,
}: ChannelAvatarProps) {
  const sizeClass = size === "sm" ? "size-6" : "size-8";
  const iconSize = size === "sm" ? 14 : 18;
  const isBranded = source === "telegram" || source === "slack";
  const badgeFill = isBranded
    ? CHANNEL_BADGE_FILL[source as "telegram" | "slack"]
    : undefined;

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center shrink-0",
        !isBranded && "bg-chip-subtle",
        sizeClass,
        className,
      )}
      style={badgeFill ? { backgroundColor: badgeFill } : undefined}
      title={source.charAt(0).toUpperCase() + source.slice(1)}
    >
      {source === "telegram" && <TelegramIcon size={iconSize} />}
      {source === "slack" && <SlackIcon size={iconSize} />}
    </div>
  );
}

function TelegramIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z"
        fill="white"
      />
    </svg>
  );
}

function SlackIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
        fill={SLACK_LOGO_COLORS.rose}
      />
      <path
        d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
        fill={SLACK_LOGO_COLORS.blue}
      />
      <path
        d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"
        fill={SLACK_LOGO_COLORS.green}
      />
      <path
        d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z"
        fill={SLACK_LOGO_COLORS.yellow}
      />
    </svg>
  );
}
