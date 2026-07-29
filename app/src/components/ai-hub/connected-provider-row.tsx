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

/**
 * ONE connected AI account in the hub's Connected strip: a brand mark, the
 * provider name, the muted line naming how it is connected and a status dot,
 * with that account's live usage underneath — the plan chip at the trailing
 * edge, then the rate-limit meters / balance / metered spend spanning the card
 * from the brand mark's own left edge, so the two read as one block rather than
 * as a card stapled under a row. Usage lives here because this is where the
 * account itself lives; there is no separate usage surface (HOU-789).
 *
 * This one is a CARD, not a line in a list (`surface="card"`), because it is not
 * one: it carries a whole second tier of its own live detail, and it opens the
 * account. So it paints its surface and hairline ring at REST — a user must see
 * it is pressable before touching it, never discover that by hovering — and
 * answers a press with the shared scale. The hover wash stays exactly as it was,
 * as enhancement. For the same reason it shows no trailing chevron: a chevron
 * says "this line drills in", and a card that already looks pressable does not
 * need a glyph to argue the point.
 *
 * Both extras ride `CatalogRow`'s own slots, which is what keeps them part of
 * the card rather than decoration beside it: `below` puts the meters INSIDE the
 * hover/focus surface AND inside the click target (one wash and one target over
 * the whole card, from either the pointer or the keyboard), and `aside` puts the
 * plan chip outside the row BUTTON, so the button's accessible name stays "name
 * + how it is connected" and the plan is still read as its own content (a
 * button's descendants are presentational, so a chip inside it is either name
 * noise or invisible).
 *
 * A row whose connection is only `checking` shows no usage tier at all — see
 * `usageSlot`.
 */
export function ConnectedProviderRow({
  account: { provider, row },
  connectionState,
  usageFetchState,
  onOpen,
}: {
  /** The provider paired with its engine usage row (null when none). */
  account: AccountUsage;
  /** This provider's connection state, from the ONE shared derivation. */
  connectionState: ProviderConnectionState;
  /** How far the strip's ONE usage fetch has got. */
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
          {/* The chip's slot is held open while the reading loads, so the row's
              title column keeps its width and nothing reflows when a plan
              lands. */}
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
