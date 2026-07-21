import type { Routine } from "@houston-ai/engine-client";
import { Webhook } from "lucide-react";
import { type ReactNode, useCallback, useMemo } from "react";
import { useIntegrationToolkits } from "../../hooks/queries/use-integrations";
import { appDisplay } from "../integrations/app-display";
import { AppLogo } from "../integrations/app-logo";
import { INTEGRATION_PROVIDER } from "../integrations/model";
import { routineLeadingIcon } from "./routine-leading-icon-model";

/**
 * Builds the Automations grid's per-row leading glyph — the routine's identity
 * at a glance. Schedule routines return `null` so the grid keeps its default
 * clock; a trigger routine shows what wakes it: the triggering app's real logo
 * for a Composio binding (resolved from the toolkits catalog, favicon fallback
 * when the toolkit is missing, exactly like every other integrations surface),
 * or a webhook glyph for an incoming-webhook binding. The kind decision is the
 * pure `routineLeadingIcon` model; this hook only renders it.
 *
 * `triggersEnabled` gates the catalog fetch (no trigger surface, no query); a
 * routine bound before the fetch resolves simply shows the favicon fallback
 * until the real logo lands.
 */
export function useRoutineLeadingIcon(
  triggersEnabled: boolean,
): (routine: Routine) => ReactNode {
  const toolkits = useIntegrationToolkits(
    INTEGRATION_PROVIDER,
    triggersEnabled,
  );
  const toolkitsBySlug = useMemo(
    () => new Map((toolkits.data ?? []).map((tk) => [tk.slug, tk])),
    [toolkits.data],
  );

  return useCallback(
    (routine: Routine) => {
      const icon = routineLeadingIcon(routine);
      if (icon.kind === "schedule") return null;
      if (icon.kind === "webhook") {
        return <Webhook className="size-4 text-ink-muted" strokeWidth={1.75} />;
      }
      return (
        <AppLogo
          display={appDisplay(icon.toolkit, toolkitsBySlug.get(icon.toolkit))}
          size="sm"
        />
      );
    },
    [toolkitsBySlug],
  );
}
