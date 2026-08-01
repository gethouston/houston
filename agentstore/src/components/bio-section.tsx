"use client";

import { BioSection as StoreBioSection } from "@houston-ai/store";
import { Markdown } from "@/components/markdown";

/**
 * The agent page's Bio: height-limited at rest with a fade-out and a quiet
 * "View more" toggle, so a long description never dwarfs the page.
 */
export function BioSection({
  tagline,
  description,
}: {
  tagline: string | null;
  description: string;
}) {
  return (
    <StoreBioSection
      tagline={tagline}
      description={description}
      renderContent={(content) => <Markdown content={content} />}
    />
  );
}
