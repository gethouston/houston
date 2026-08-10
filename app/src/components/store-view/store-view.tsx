import {
  fetchStoreAgent,
  type StoreCatalogAgent,
} from "@houston-ai/engine-client";
import { useEffect, useState } from "react";
import { useMyStoreProfile } from "../../hooks/use-my-store-profile";
import { reportError } from "../../lib/error-report";
import { useUIStore } from "../../stores/ui";
import { PageHeaderToolsProvider } from "../shell/page-header/page-header-tools";
import { CreatorProfilePane } from "./creator/creator-profile-pane";
import { MyAgentsPanel } from "./my-agents-panel";
import { CreatorProfileEditorDialog } from "./profile/creator-profile-editor";
import { StoreBrowse } from "./store-browse";
import { StoreDetailPane } from "./store-detail-pane";
import {
  STORE_HEADER_THRESHOLDS,
  StoreHeader,
  type StorePane,
} from "./store-header";

export function StoreView() {
  const { profile: myProfile } = useMyStoreProfile();
  const [pane, setPane] = useState<StorePane>("browse");
  const [detailAgent, setDetailAgent] = useState<StoreCatalogAgent | null>(
    null,
  );
  const ownerTab = useUIStore((state) => state.storeOwnerTab);
  const focusSlug = useUIStore((state) => state.storeFocusSlug);
  const creatorHandle = useUIStore((state) => state.storeCreatorHandle);
  const setCreatorHandle = useUIStore((state) => state.setStoreCreatorHandle);
  // The creator-profile editor is mounted HERE, at the Store's root, because
  // every control that opens it is inside this view: the claim card and the
  // owner pencils in `MyAgentsPanel`, which this view renders from two
  // branches. It used to hang off the rail's avatar menu, which meant a store
  // affordance depended on a shell control that has since been removed.
  const creatorEditorOpen = useUIStore((state) => state.creatorEditorOpen);
  const setCreatorEditorOpen = useUIStore(
    (state) => state.setCreatorEditorOpen,
  );

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
  return (
    <PageHeaderToolsProvider thresholds={STORE_HEADER_THRESHOLDS}>
      <div className="flex h-full flex-col">
        <StoreHeader
          pane={pane}
          detailAgent={detailAgent}
          creatorHandle={creatorHandle}
          onBrowse={showBrowse}
          onMyAgents={showMyAgents}
          onOpenCreator={openCreator}
        />
        <div className="flex-1 overflow-auto">
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
            <StoreBrowse
              onOpenAgent={setDetailAgent}
              onOpenCreator={openCreator}
            />
          )}
        </div>
        <CreatorProfileEditorDialog
          open={creatorEditorOpen}
          onOpenChange={setCreatorEditorOpen}
        />
      </div>
    </PageHeaderToolsProvider>
  );
}
