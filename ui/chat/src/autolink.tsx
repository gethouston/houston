import { LinkIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A link rendered inline in a chat message — the Slack-style link chip
 * (HOU-1152): `link`-token blue on a soft `link` tint with a chain glyph.
 * EVERY link in chat wears it: bare URLs, labeled `[Open report](…)` links
 * (which rendered as a solid button pill until HOU-1152's follow-up), and
 * URLs a person pasted into their own bubble. One shape, so a message with
 * two kinds of link doesn't read as two different products. Shared by the
 * markdown override (`MessageResponse`) and the plain-text path
 * (`plain-message-text.tsx`) so a link looks identical whether its message
 * rendered markdown or not.
 *
 * The chip background is the resting affordance (hover only ADDS the
 * underline, never carries it alone). `box-decoration-break: clone` keeps
 * rounded ends on every line when a long chip wraps. Inside the USER's
 * action-filled bubble the blue fails contrast against the fill, so those
 * keep the bubble's own ink over the same tint.
 */
export const AUTOLINK_CLASS =
  "text-link bg-link/10 rounded px-1 py-0.5 [box-decoration-break:clone] [-webkit-box-decoration-break:clone] hover:underline underline-offset-4 [overflow-wrap:anywhere] group-[.is-user]:text-input dark:group-[.is-user]:text-ink";

export interface AutolinkProps {
  href: string;
  /** Opens the URL (system browser on desktop). */
  onOpen: () => void;
  children: ReactNode;
}

export function Autolink({ href, onOpen, children }: AutolinkProps) {
  const icon = (
    <LinkIcon
      aria-hidden
      className="mr-1 inline size-3 align-[-1.5px] opacity-70"
    />
  );
  // Glue the glyph to the URL's first characters: browsers may break a line
  // between an atomic inline (the svg) and text, which strands the icon at
  // the end of the previous line when a chip wraps. A nowrap span around
  // icon + head forces the break into the tail instead. Non-string children
  // (streaming wrappers on a non-web autolink) can't be split — the icon
  // rides alone, and those labels are short enough not to wrap.
  const glued =
    typeof children === "string" ? (
      <>
        <span className="whitespace-nowrap">
          {icon}
          {children.slice(0, 8)}
        </span>
        {children.slice(8)}
      </>
    ) : (
      <>
        {icon}
        {children}
      </>
    );
  return (
    <a
      href={href}
      rel="noreferrer"
      title={href}
      onClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
      className={AUTOLINK_CLASS}
    >
      {glued}
    </a>
  );
}
