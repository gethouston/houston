import { AppSidebar } from "@houston-ai/layout";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Viewport } from "./sample";

/**
 * The scenery around the rail in the `AppSidebar` specimen: the pane it sits
 * beside (so its 220/56px width reads true), the footer slot the desktop shell
 * fills, and the empty-workspace rail. None of it is the component under
 * study — it is what makes the component readable on the page.
 */

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
