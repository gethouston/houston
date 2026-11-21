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
