import { CATALOG_PLANE_MAX_W, cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { PageContainer } from "../shell/page-shell";

/**
 * Where the Skills surface stands. Both scopes render the SAME list and the
 * same editor; only the frame around them differs.
 *
 * `screen` is the workspace library: it owns a whole screen, so it pins its
 * header strip above its own scroller. `inline` is an agent's Skills section
 * in the settings rail, which already provides the strip and the scroller —
 * nesting a second one there would trap the content in a short inner window.
 */
export type SkillsFrame = "screen" | "inline";

export function SkillsSurfaceFrame({
  frame,
  header,
  padClassName,
  contentClassName,
  dataAttrs,
  children,
}: {
  frame: SkillsFrame;
  /** The header the scope brings: the page strip, or the section's hero. */
  header: ReactNode;
  /** The screen frame's vertical rhythm inside its own scroller. */
  padClassName: string;
  /** Extra layout on the content plane itself (the editor stacks its cards). */
  contentClassName?: string;
  dataAttrs?: Record<string, string>;
  children: ReactNode;
}) {
  const plane = (
    <div
      className={cn("mx-auto w-full", CATALOG_PLANE_MAX_W, contentClassName)}
    >
      {children}
    </div>
  );

  if (frame === "inline")
    return (
      <div {...dataAttrs}>
        {header}
        {plane}
      </div>
    );

  return (
    <div {...dataAttrs} className="flex h-full min-h-0 flex-col">
      {header}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <PageContainer width="wide" className={padClassName}>
          {plane}
        </PageContainer>
      </div>
    </div>
  );
}
