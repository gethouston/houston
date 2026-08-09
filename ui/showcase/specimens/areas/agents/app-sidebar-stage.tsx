import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { AppSidebar } from "@houston-ai/layout";
import { Plus, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Viewport } from "./sample";

/**
 * The scenery around the rail in the `AppSidebar` specimen: the pane it sits
 * beside (so its 220/56px width reads true), the footer slot the desktop shell
 * fills, and the empty-workspace rail. None of it is the component under
 * study — it is what makes the component readable on the page.
 */

/**
 * What a FOLDED block says on behalf of the rows it is hiding. The library
 * counts nothing and draws nothing: `trailing` is a slot, and this is one
 * plausible thing to put in it.
 */
export function BlockRollup({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      role="img"
      aria-label={`${count} inside`}
      title={`${count} inside`}
      className="rounded-full bg-input/90 px-2 text-[11px] text-ink/80 leading-5"
    >
      {count}
    </span>
  );
}

/** The rail beside the pane it sits next to, so its 220/56px width reads true. */
export function SidebarStage({ children }: { children: ReactNode }) {
  return (
    <Viewport className="h-[440px] w-full max-w-2xl">
      {children}
      <div className="flex flex-1 items-center justify-center p-6 text-center text-ink-muted text-xs">
        The agent's workspace — whatever the selected rail row opens.
      </div>
    </Viewport>
  );
}

/** The teams a shared space holds that this caller has not pinned to the rail. */
const JOINABLE = [
  { id: "design", name: "Design", people: 4 },
  { id: "support", name: "Support", people: 9 },
];

/**
 * The one control the "Your teams" band carries, supplied by the host through
 * `sectionAction`.
 *
 * It is ONE menu on purpose. Creating an agent, creating a team and joining one
 * are the only things the rail can add, and they used to be three separate
 * affordances -- a "+", a New team glyph, and a whole disclosure at the foot of
 * the rail listing every team you had not joined. Under one trigger, the band
 * keeps a single control and unjoined teams stop outranking the teams you
 * actually work in.
 */
export function TeamsBandMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Add to the rail"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus data-[state=open]:bg-hover data-[state=open]:text-ink"
        >
          <Plus className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom">
        <DropdownMenuItem>New agent</DropdownMenuItem>
        <DropdownMenuItem>New team</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Join a team</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {JOINABLE.map((team) => (
              <DropdownMenuItem key={team.id}>
                {team.name} · {team.people} people
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The footer slot the desktop shell fills with its update notice. */
export function UpdateNotice() {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 text-ink-muted text-xs">
      <Sparkles className="size-3.5 shrink-0" />
      Update ready — restart to install
    </div>
  );
}

/** A brand-new workspace: the section label and the + button, nothing under. */
export function EmptyRail() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <AppSidebar
      sectionLabel="Your agents"
      items={[]}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAdd={() => setSelectedId(null)}
    />
  );
}
