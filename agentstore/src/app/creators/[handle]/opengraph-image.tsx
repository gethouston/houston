import { HANDLE_REGEX, normalizeHandle } from "@houston/agentstore-contract";
import { ImageResponse } from "next/og";
import { OG_SIZE, OgCard } from "@/lib/og-card";
import { getCreator } from "@/lib/store-api";

/**
 * Per-creator share card: the face of a `/@handle` link. Falls back to the
 * store's default card when the handle is unknown (the page 404s; a crawler that
 * still fetches the image gets something branded).
 */

export const alt = "Creator on the Houston Agent Store";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const raw = normalizeHandle((await params).handle);
  const data = HANDLE_REGEX.test(raw) ? await getCreator(raw) : null;

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

  const { profile } = data;
  const subtitle =
    profile.bio || `Agents by @${raw} on the Houston Agent Store.`;
  return new ImageResponse(
    <OgCard
      kicker="Houston Agent Store"
      title={profile.displayName}
      subtitle={subtitle}
      chip={profile.verified ? "Verified" : `@${raw}`}
    />,
    size,
  );
}
