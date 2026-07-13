import { ImageResponse } from "next/og";
import { OG_SIZE, OgCard } from "@/lib/og-card";
import { siteConfig } from "@/lib/site-config";

/** Default share card for every page without a more specific one. */

export const alt = siteConfig.name;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <OgCard
      kicker="agents.gethouston.ai"
      title="Houston Agent Store"
      subtitle="Find an AI agent and install it in one click. No code, no terminal."
    />,
    size,
  );
}
