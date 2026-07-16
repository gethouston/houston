import { ImageResponse } from "next/og";
import { taglineOrDescription } from "@/lib/export/shared";
import { OG_SIZE, OgCard } from "@/lib/og-card";
import { getAgentBySlug } from "@/lib/store-api";

/**
 * Per-agent share card: the influencer-facing face of an agent link. Falls
 * back to the store's default card copy when the slug is unknown (the page
 * itself 404s; crawlers that still fetch the image get something branded).
 */

export const alt = "Agent on the Houston Agent Store";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getAgentBySlug(slug);

  if (!data) {
    return new ImageResponse(
      <OgCard
        kicker="agents.gethouston.ai"
        title="Houston Agent Store"
        subtitle="Find an AI agent and install it in one click. No code, no terminal."
      />,
      size,
    );
  }

  const { ir, agent } = data;
  return new ImageResponse(
    <OgCard
      kicker="Houston Agent Store · one-click install"
      title={ir.identity.name}
      subtitle={taglineOrDescription(ir, 140)}
      chip={agent.category}
    />,
    size,
  );
}
