import { Tabs, TabsContent, TabsList, TabsTrigger } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { MyAgentsPanel } from "./my-agents-panel";
import { StoreBrowse } from "./store-browse";

/** The two Agent Store destinations. */
const BROWSE = "browse";
const MY_AGENTS = "my";

/**
 * The Agent Store page (sidebar destination): a two-tab shell over the public
 * catalog ({@link StoreBrowse}) and the signed-in owner's dashboard
 * ({@link MyAgentsPanel}). Browse is kept mounted so its search and filter
 * state survive tab switches and the `storeFocusSlug` deep link opens the
 * detail dialog from either tab; the owner dashboard mounts (and queries the
 * authed `GET /me/agents`) only once its tab is selected.
 */
export function StoreView() {
  const { t } = useTranslation("store");
  const [tab, setTab] = useState<string>(BROWSE);

  // One-shot deep link into the "my agents" tab: "Manage all my agents"
  // surfaces set the flag before switching views (mirrors storeFocusSlug).
  const ownerTab = useUIStore((s) => s.storeOwnerTab);
  useEffect(() => {
    if (!ownerTab) return;
    useUIStore.getState().setStoreOwnerTab(null);
    setTab(MY_AGENTS);
  }, [ownerTab]);

  // A "See it in the store" deep link always lands on Browse, where the detail
  // dialog opens (StoreBrowse consumes and clears the slug). Only switches the
  // tab here; the fetch and dialog stay owned by Browse.
  const focusSlug = useUIStore((s) => s.storeFocusSlug);
  useEffect(() => {
    if (focusSlug) setTab(BROWSE);
  }, [focusSlug]);

  return (
    <div className="h-full overflow-auto">
      <PageContainer className="py-10">
        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
          className="mb-7"
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value={BROWSE}>{t("tabs.browse")}</TabsTrigger>
            <TabsTrigger value={MY_AGENTS}>{t("tabs.myAgents")}</TabsTrigger>
          </TabsList>

          <TabsContent
            value={BROWSE}
            forceMount
            className="hidden data-[state=active]:block"
          >
            <StoreBrowse />
          </TabsContent>
          <TabsContent value={MY_AGENTS}>
            <MyAgentsPanel />
          </TabsContent>
        </Tabs>
      </PageContainer>
    </div>
  );
}
