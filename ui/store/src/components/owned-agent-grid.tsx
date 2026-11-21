import type {
  OwnedAgentIdentity,
  OwnedAgentRow,
  StoreCategoryRow,
  StoreLinkComponent,
} from "../types";
import type { AgentCardLabels } from "./agent-card";
import type { EditListingDialogLabels } from "./edit-listing-model";
import { OwnedAgentCard, type OwnedAgentCardLabels } from "./owned-agent-card";
import type {
  ShareAgentDialogLabels,
  ShareVisibility,
} from "./share-agent-dialog";

export interface CreatorProfileOwner {
  editHref: string;
  busyId?: string | null;
  onShareSelect: (id: string, visibility: ShareVisibility) => void;
  onDelete: (id: string) => void;
  onEditIdentity?: (id: string, identity: OwnedAgentIdentity) => Promise<void>;
  categories?: StoreCategoryRow[];
  shareHrefFor?: (agent: OwnedAgentRow) => string | null;
  cardLabels?: Partial<OwnedAgentCardLabels>;
  shareLabels?: Partial<ShareAgentDialogLabels>;
  editLabels?: Partial<EditListingDialogLabels>;
  editAvatarLabel?: string;
  editProfileLabel?: string;
}

export function OwnedAgentGrid({
  agents,
  owner,
  agentHref,
  agentCardLabels,
  LinkComponent,
}: {
  agents: OwnedAgentRow[];
  owner: CreatorProfileOwner;
  agentHref: (agent: OwnedAgentRow) => string;
  agentCardLabels?: Partial<AgentCardLabels>;
  LinkComponent?: StoreLinkComponent;
}) {
  const onEditIdentity = owner.onEditIdentity;
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <OwnedAgentCard
          key={agent.id}
          agent={agent}
          href={agentHref(agent)}
          busy={owner.busyId === agent.id}
          shareHref={owner.shareHrefFor?.(agent)}
          onShareSelect={(next) => owner.onShareSelect(agent.id, next)}
          onDelete={() => owner.onDelete(agent.id)}
          onEditSave={
            onEditIdentity && ((identity) => onEditIdentity(agent.id, identity))
          }
          categories={owner.categories}
          labels={owner.cardLabels}
          shareLabels={owner.shareLabels}
          editLabels={owner.editLabels}
          cardLabels={agentCardLabels}
          LinkComponent={LinkComponent}
        />
      ))}
    </div>
  );
}
