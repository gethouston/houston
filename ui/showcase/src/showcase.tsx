import { cn } from "@houston-ai/core";
import { storeMotion, storeType } from "@houston-ai/store";
import { MoonStar, Sun } from "lucide-react";

import {
  componentCount,
  DEFAULT_SPECIMEN_ID,
  specimenIds,
  specimens,
  specimenTiers,
} from "./registry";
import { ShowcaseNav } from "./showcase-nav";
import { useShowcaseTheme, useSpecimenRoute } from "./use-showcase-state";
import { SpecimenIdProvider } from "./used-in";

/**
 * The review surface for every `@houston-ai/*` package: a fixed bar with the
 * theme switch, a grouped and filterable rail of specimens, and the selected
 * specimen beside it.
 *
 * The chrome follows the same design language as the components it presents —
 * flat surfaces, hairlines, colour-only motion, both themes, tokens only.
 */
export function Showcase() {
  const { theme, toggleTheme } = useShowcaseTheme();
  const { id, select } = useSpecimenRoute(specimenIds, DEFAULT_SPECIMEN_ID);
  const active = specimens.find((one) => one.id === id);

  return (
    // Transparent, like the app shell root: the page plane is the shared
    // canvas painted on the body (aurora in dark, clean gutter in light).
    <div className="min-h-full text-ink">
      <header className="fixed inset-x-0 top-0 z-20 border-line border-b bg-gutter/85 backdrop-blur-md">
        <div className="flex h-14 items-center gap-6 px-6">
          <span className="shrink-0 font-semibold text-[13px] text-ink tracking-tight">
            Houston
            <span className="mx-2 font-normal text-ink-muted">—</span>
            <span className="font-normal text-ink-muted">
              Component Showcase
            </span>
          </span>

          <span className={cn(storeType.meta, "ml-auto tabular-nums")}>
            {componentCount} components
          </span>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted outline-none",
              storeMotion,
              "hover:border-line-input hover:bg-hover hover:text-hover-text",
              "focus-visible:ring-[3px] focus-visible:ring-focus/50",
            )}
          >
            {theme === "dark" ? (
              <MoonStar className="size-4" />
            ) : (
              <Sun className="size-4" />
            )}
          </button>
        </div>
      </header>

      <aside className="fixed inset-y-0 top-14 left-0 z-10 w-64 border-line border-r bg-gutter/85 backdrop-blur-md">
        <ShowcaseNav
          tiers={specimenTiers}
          activeId={active?.id}
          onSelect={select}
        />
      </aside>

      <main className="pt-14 pl-64">
        {active ? (
          // The provider is what lets `SpecimenPage` render the "Used in" row
          // without every page having to pass its own id back down.
          <SpecimenIdProvider id={active.id}>
            {active.group === "Agent Store" ? (
              // Store screens live INSIDE the app's screen pane (and the
              // website's equivalent), never on the bare gutter — preview
              // them on the real surface so what's approved here is what
              // ships (user decision 2026-07-29).
              <div className="canvas-screen min-h-full bg-background">
                {active.render()}
              </div>
            ) : (
              active.render()
            )}
          </SpecimenIdProvider>
        ) : (
          <p className={cn(storeType.body, "p-8 text-ink-muted")}>
            No specimen selected.
          </p>
        )}
      </main>
    </div>
  );
}
