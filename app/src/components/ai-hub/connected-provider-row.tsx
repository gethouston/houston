import { Badge, CatalogRow, Skeleton, StatusDot } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ProviderConnectionState } from "../../lib/provider-connection";
import {
  providerCostLine,
  providerDescription,
} from "../../lib/provider-overrides";
import { BrandMark } from "../provider-browser/brand-mark";
import { ProviderUsageMeters } from "./provider-usage-meters";
import {
  type AccountUsage,
  type UsageFetchState,
  usageSlot,
} from "./provider-usage-model";

export function ConnectedProviderRow({
  account: { provider, row },
  connectionState,
  usageFetchState,
  onOpen,
}: {
  account: AccountUsage;
  connectionState: ProviderConnectionState;
  usageFetchState: UsageFetchState;
  onOpen: () => void;
}) {
  const { t } = useTranslation("aiHub");
  const description =
    providerCostLine(provider.id) ?? providerDescription(provider.id);
  const checking = connectionState === "checking";
  const slot = usageSlot(connectionState, usageFetchState, row);
  return (
    <CatalogRow
      surface="card"
      icon={<BrandMark providerId={provider.id} size="lg" />}
      title={provider.name}
      description={description || undefined}
      onClick={onOpen}
      statusDot={
        <StatusDot
          status={checking ? "pending" : "active"}
          srLabel={t(checking ? "card.checking" : "card.connected")}
        />
      }
      aside={
        <div className="flex items-center">
          {slot.kind === "loading" && (
            <Skeleton aria-hidden className="h-5 w-10 rounded-full" />
          )}
          {slot.kind === "meters" && slot.row.plan && (
            <Badge variant="secondary" className="capitalize">
              {slot.row.plan}
            </Badge>
          )}
        </div>
      }
      below={
        slot.kind === "hidden" ? undefined : <ProviderUsageMeters slot={slot} />
      }
    />
  );
}
