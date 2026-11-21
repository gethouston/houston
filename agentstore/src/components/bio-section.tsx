"use client";

import { BioSection as StoreBioSection } from "@houston-ai/store";
import { Markdown } from "@/components/markdown";

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
