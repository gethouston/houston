import {
  type ChatActionBrand,
  humanizeActionDone,
  humanizeActionGerund,
} from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import {
  useCustomIntegrationsFor,
  useCustomTransportAgentId,
} from "../hooks/queries";
import {
  camelToSnakeCase,
  customActionOf,
  prettifyCustomSlug,
  toolkitOfActionSlug,
} from "./integrations/app-display";
import { useReadyToolkitCatalog } from "./integrations/use-toolkit-catalog";
import { useToolkitBrandResolver } from "./use-toolkit-brand-resolver";

export function useActionBrandResolver(
  agentId?: string,
): (action: string) => ChatActionBrand | undefined {
  const catalog = useReadyToolkitCatalog();
  const catalogData = catalog.data;
  const slugs = useMemo(
    () => (catalogData ?? []).map((tk) => tk.slug),
    [catalogData],
  );
  const transportAgentId = useCustomTransportAgentId();
  const custom = useCustomIntegrationsFor(agentId ?? transportAgentId);
  const customDefs = custom.data;
  const resolveBrand = useToolkitBrandResolver();
  return useCallback(
    (action) => {
      if (!action) return undefined;
      const customRef = customActionOf(action);
      if (customRef) {
        const def = (customDefs ?? []).find((d) => d.slug === customRef.slug);
        return {
          name: def?.name ?? prettifyCustomSlug(customRef.slug),
          ...(def?.iconUrl ? { logoUrl: def.iconUrl } : { icon: "tool" }),
          actionLabel: humanizeActionGerund(
            camelToSnakeCase(customRef.tool),
            "",
          ),
          doneLabel: humanizeActionDone(camelToSnakeCase(customRef.tool), ""),
        };
      }
      const toolkit = toolkitOfActionSlug(action, slugs);
      const brand = resolveBrand(toolkit);
      if (!brand) return undefined;
      return {
        name: brand.name,
        logoUrl: brand.logoUrl,
        actionLabel: humanizeActionGerund(action, toolkit),
        doneLabel: humanizeActionDone(action, toolkit),
      };
    },
    [slugs, customDefs, resolveBrand],
  );
}
