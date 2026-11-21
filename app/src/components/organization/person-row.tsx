import { Avatar, AvatarFallback, AvatarImage } from "@houston-ai/core";
import type { ReactNode } from "react";
import { initialsFor } from "./people-tab-model.ts";

export function PersonRow({
  name,
  avatarUrl,
  isSelf,
  selfLabel,
  secondary,
  children,
}: {
  name: string;
  avatarUrl?: string | null;
  isSelf?: boolean;
  selfLabel?: string;
  secondary?: ReactNode;
  children?: ReactNode;
}) {
  const primary = (
    <>
      {name}
      {isSelf && selfLabel && (
        <span className="ml-1.5 text-xs text-ink-muted">{selfLabel}</span>
      )}
    </>
  );

  return (
    <li className="flex items-center gap-3 rounded-xl px-3 py-2.5">
      <Avatar>
        {avatarUrl && (
          <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />
        )}
        <AvatarFallback className="text-xs">{initialsFor(name)}</AvatarFallback>
      </Avatar>
      {secondary === undefined ? (
        <p className="min-w-0 flex-1 truncate text-sm text-ink">{primary}</p>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">{primary}</p>
          <p className="truncate text-[13px] text-ink-muted">{secondary}</p>
        </div>
      )}
      {children}
    </li>
  );
}

export const personRowTriggerClass =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-line px-3 text-sm text-ink hover:bg-chip focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:opacity-50";
