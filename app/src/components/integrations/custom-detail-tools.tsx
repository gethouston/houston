import { Skeleton } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useCustomIntegrationTools } from "../../hooks/queries";

/** How many actions the detail card lists before collapsing behind a count
 *  line — a 200-endpoint API must not turn the modal into a scroll marathon. */
const TOOLS_PREVIEW_CAP = 8;

/**
 * The "Available actions" block of the custom detail card: heading over the
 * compiled tool list (capped, with an "and N more" line), a skeleton while it
 * loads, an honest error line on a failed fetch. The whole block (heading
 * included) hides on the feature-absent degrade (`data === null`) — a title
 * over nothing reads broken.
 */
export function CustomDetailTools({
  slug,
  agentId,
}: {
  slug: string;
  /** Per-agent surface (HOU-823): the read rides the agent's routes. */
  agentId?: string;
}) {
  const { t } = useTranslation("integrations");
  const tools = useCustomIntegrationTools(slug, agentId);
  if (tools.data === null) return null;

  const shown = (tools.data ?? []).slice(0, TOOLS_PREVIEW_CAP);
  const hiddenCount = (tools.data?.length ?? 0) - shown.length;

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink">
        {t("custom.details.toolsTitle")}
      </p>
      {tools.isLoading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : tools.isError || tools.data === undefined ? (
        <p className="text-[13px] text-ink-muted">
          {t("custom.details.toolsError")}
        </p>
      ) : tools.data.length === 0 ? (
        <p className="text-[13px] text-ink-muted">
          {t("custom.details.toolsEmpty")}
        </p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
          {shown.map((tool) => (
            <li key={tool.name} className="text-[13px]">
              <span className="text-ink">{tool.name}</span>
              {tool.description && (
                <span className="text-ink-muted"> · {tool.description}</span>
              )}
            </li>
          ))}
          {hiddenCount > 0 && (
            <li className="text-[13px] text-ink-muted">
              {t("custom.details.moreTools", { count: hiddenCount })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
