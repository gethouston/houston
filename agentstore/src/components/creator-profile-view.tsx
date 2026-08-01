"use client";

import type { StoreAgentSummary } from "@houston/agentstore-client";
import {
  CreatorProfileScreen,
  type StoreCreatorProfile,
} from "@houston-ai/store";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { MeClient } from "@/app/me/me-client";
import { useSession } from "@/lib/auth/session";
import { launchStoreInstall } from "@/lib/houston-launch";
import { getMyProfile } from "@/lib/store-client";

/**
 * Client shell for the creator page: supplies the non-serializable seams
 * (Next Link, the Try action) so the server page passes data only.
 *
 * Ownership upgrade: there is ONE profile page per creator. When the signed-in
 * viewer turns out to BE this creator, the page swaps to the owner experience
 * (`MeClient` — the same `CreatorProfileScreen` in owner mode) in place, same
 * URL. Until that's established the public view renders, so anonymous and
 * other-creator visits are untouched.
 */
export function CreatorProfileView({
  profile,
  agents,
  stats,
  socialLinks,
  actions,
  pagination,
}: {
  profile: StoreCreatorProfile;
  agents: StoreAgentSummary[];
  stats?: { agents: number; installs: number };
  socialLinks?: ReactNode;
  actions?: ReactNode;
  pagination?: ReactNode;
}) {
  const { status, getToken } = useSession();
  const [ownHandle, setOwnHandle] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "signed-in") return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const mine = await getMyProfile(token);
        if (!cancelled && mine?.handle) setOwnHandle(mine.handle);
      } catch (err) {
        // Passive enhancement only: the public page is already correct, so a
        // failed ownership probe must not error it. Logged for diagnosis; the
        // owner path (/me) surfaces the same failure loudly on navigation.
        console.error("[creator-profile] ownership probe failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, getToken]);

  if (profile.handle && ownHandle === profile.handle) {
    return <MeClient />;
  }

  return (
    <CreatorProfileScreen
      profile={profile}
      agents={agents}
      stats={stats}
      socialLinks={socialLinks}
      actions={actions}
      pagination={pagination}
      agentHref={(agent) => `/a/${agent.slug}`}
      LinkComponent={Link}
      onTryAgent={(agent) => {
        if (agent.slug) launchStoreInstall(agent.slug);
      }}
    />
  );
}
