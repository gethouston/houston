import {
  fetchStoreAgent,
  type StoreCatalogAgent,
} from "@houston-ai/engine-client";
import { StoreNav } from "@houston-ai/store";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMyStoreProfile } from "../../hooks/use-my-store-profile";
import { useSession } from "../../hooks/use-session";
import { reportError } from "../../lib/error-report";
import { useUIStore } from "../../stores/ui";
import { CreatorProfilePane } from "./creator/creator-profile-pane";
import { MyAgentsPanel } from "./my-agents-panel";
import { StoreBrowse } from "./store-browse";
import { StoreDetailPane } from "./store-detail-pane";
import { actionLink } from "./store-link";

type StorePane = "browse" | "my-agents";

export function StoreView() {
  const { t } = useTranslation("store");
  const { data: session } = useSession();
  const { profile: myProfile } = useMyStoreProfile();
  const [pane, setPane] = useState<StorePane>("browse");
  const [detailAgent, setDetailAgent] = useState<StoreCatalogAgent | null>(
    null,
  );
  const ownerTab = useUIStore((state) => state.storeOwnerTab);
  const focusSlug = useUIStore((state) => state.storeFocusSlug);
  const creatorHandle = useUIStore((state) => state.storeCreatorHandle);
  const setCreatorHandle = useUIStore((state) => state.setStoreCreatorHandle);

  useEffect(() => {
    if (!ownerTab) return;
    useUIStore.getState().setStoreOwnerTab(null);
    setCreatorHandle(null);
    setDetailAgent(null);
    setPane("my-agents");
  }, [ownerTab, setCreatorHandle]);
  useEffect(() => {
    if (!focusSlug) return;
    useUIStore.getState().setStoreFocusSlug(null);
    setPane("browse");
    setCreatorHandle(null);
    fetchStoreAgent(focusSlug)
      .then((detail) => setDetailAgent(detail.agent))
      .catch((error: unknown) =>
        reportError(
          "store_focus",
          `store focus fetch failed (${focusSlug})`,
          error,
        ),
      );
  }, [focusSlug, setCreatorHandle]);

  const openCreator = (handle: string) => {
    setDetailAgent(null);
    setCreatorHandle(handle);
    setPane("browse");
  };
  const showBrowse = () => {
    setDetailAgent(null);
    setCreatorHandle(null);
    setPane("browse");
  };
  const showMyAgents = () => {
    setDetailAgent(null);
    setCreatorHandle(null);
    setPane("my-agents");
  };
  const navLink = actionLink(showBrowse);
  const navUser = session
    ? {
        avatarUrl: session.photoUrl ?? undefined,
        initial: (session.displayName || session.email || "?")
          .trim()
          .charAt(0)
          .toUpperCase(),
      }
    : null;

  return (
    <div className="h-full overflow-auto">
      <StoreNav
        homeHref="store:browse"
        brandLabel={t("title")}
        account={{ user: navUser, onOpen: showMyAgents }}
        labels={{
          account: t("tabs.myAgents"),
          signIn: t("nav.signIn"),
        }}
        LinkComponent={navLink}
      />
      {detailAgent || creatorHandle || pane === "my-agents" ? (
        <main className="mx-auto w-full max-w-[1040px] px-6 pt-6 pb-16 md:px-8">
          {detailAgent ? (
            <StoreDetailPane
              agent={detailAgent}
              onOpenAgent={setDetailAgent}
              onOpenCreator={openCreator}
            />
          ) : creatorHandle ? (
            // ONE profile page per creator: your own handle lands on the owner
            // view (edit affordances), anyone else's on the public view.
            creatorHandle === myProfile?.handle ? (
              <MyAgentsPanel
                onOpenAgentSlug={(slug) => {
                  useUIStore.getState().setStoreFocusSlug(slug);
                }}
              />
            ) : (
              <CreatorProfilePane
                handle={creatorHandle}
                onOpenAgent={setDetailAgent}
              />
            )
          ) : (
            <MyAgentsPanel
              onOpenAgentSlug={(slug) => {
                useUIStore.getState().setStoreFocusSlug(slug);
              }}
            />
          )}
        </main>
      ) : (
        <StoreBrowse onOpenAgent={setDetailAgent} onOpenCreator={openCreator} />
      )}
    </div>
  );
}
