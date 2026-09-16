import { Skeleton } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import { useSurfaceGates } from "../../../hooks/use-surface-gates";
import { OrganizationView } from "../../organization";
import { useOrgNav } from "../../organization/org-nav-store";
import { BackBarScreen } from "../../shell/back-bar-screen";
import type { BackTarget } from "../../shell/back-control";
import { SettingsCard } from "../settings-row";
import { WorkspaceSection } from "./workspace";
import {
  type SettledWorkspaceManagementFace,
  workspaceManagementDropsOrgPin,
  workspaceManagementFace,
} from "./workspace-management-model";

/**
 * The two faces of Workspace management carry the way back differently,
 * because only one of them frames itself. The org dashboard has a header
 * strip, so the back control rides IN it; the plain workspace-name card has no
 * strip of its own, so it keeps the shared back bar above the reading column.
 *
 * Which face renders is the pure {@link workspaceManagementFace}: the gates
 * read false while capabilities reload, so the face is held rather than
 * recomputed from a gate that has not answered.
 */
export function WorkspaceManagementSection({ back }: { back: BackTarget }) {
  const { showOrganization, ready } = useSurfaceGates();
  const requestedTab = useOrgNav((s) => s.requestedTab);
  const clearRequestedTab = useOrgNav((s) => s.clearRequestedTab);
  // The last face the gates actually settled on. A ref rather than state: it
  // never drives a render of its own, it only answers what to hold during the
  // window where the gates cannot.
  const last = useRef<SettledWorkspaceManagementFace | null>(null);
  const face = workspaceManagementFace({
    ready,
    showOrganization,
    last: last.current,
  });
  if (face !== "pending") last.current = face;

  // A pinned dashboard section only the dashboard can spend. On the face that
  // never draws one it is dropped, so it cannot ride the session and open the
  // next dashboard the user reaches on a section they never asked for.
  const dropsPin = workspaceManagementDropsOrgPin(face);
  useEffect(() => {
    if (dropsPin && requestedTab !== null) clearRequestedTab();
  }, [dropsPin, requestedTab, clearRequestedTab]);

  if (face === "organization") return <OrganizationView back={back} />;

  return (
    <BackBarScreen backLabel={back.label} onBack={back.onClick}>
      <div className="mx-auto max-w-xl px-4 pb-10 md:px-8">
        <SettingsCard>
          {face === "pending" ? (
            <div className="flex flex-col gap-3 p-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <WorkspaceSection />
          )}
        </SettingsCard>
      </div>
    </BackBarScreen>
  );
}
