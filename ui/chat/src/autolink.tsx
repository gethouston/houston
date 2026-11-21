import { LinkIcon } from "lucide-react";
import type { ReactNode } from "react";

export const AUTOLINK_CLASS =
  "text-link bg-link/10 rounded px-1 py-0.5 [box-decoration-break:clone] [-webkit-box-decoration-break:clone] hover:underline underline-offset-4 [overflow-wrap:anywhere] group-[.is-user]:text-bubble-chip-text";

export interface AutolinkProps {
  href: string;
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
