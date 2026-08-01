"use client";

import * as React from "react";

export function BioSection({
  tagline,
  description,
  renderContent,
  labels = {},
}: {
  tagline?: string | null;
  description: string;
  renderContent: (content: string) => React.ReactNode;
  labels?: Partial<{ viewMore: string; viewLess: string }>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const text = { viewMore: "View more", viewLess: "View less", ...labels };
  return (
    <div className="flex flex-col gap-4">
      <div className={expanded ? "" : "relative max-h-64 overflow-hidden"}>
        {tagline ? <p className="mb-5 text-ink text-lg">{tagline}</p> : null}
        {renderContent(description)}
        {!expanded ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="self-start text-[14px] text-ink-muted transition-colors duration-150 hover:text-ink"
      >
        {expanded ? text.viewLess : text.viewMore}
      </button>
    </div>
  );
}
