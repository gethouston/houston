import { type ChatActionBrand, humanizeActionGerund } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { toolkitOfActionSlug } from "./integrations/app-display";
import { useReadyToolkitCatalog } from "./integrations/use-toolkit-catalog";
import { useToolkitBrandResolver } from "./use-toolkit-brand-resolver";

/**
 * A read-only resolver from a Composio ACTION slug (e.g. `GMAIL_SEND_EMAIL`) to
 * the process-block header's branded row — the app-side counterpart to
 * `ui/chat`'s `resolveActionBrand` port (ui/chat stays Composio-unaware).
 *
 * It composes three pieces the app already owns: the action's toolkit is the
 * longest catalog slug that prefixes it (`toolkitOfActionSlug`), that toolkit
 * resolves to a name + logo through the shared brand resolver, and the action
 * humanizes to a present-tense label ("Sending email"). A catalog MISS still
 * yields a branded row — the prettified toolkit name with NO logo — so the row
 * degrades gracefully and never shows a raw slug or a broken image. Stable
 * across renders unless the catalog moves.
 */
export function useActionBrandResolver(): (
  action: string,
) => ChatActionBrand | undefined {
  const catalog = useReadyToolkitCatalog();
  const catalogData = catalog.data;
  const slugs = useMemo(
    () => (catalogData ?? []).map((tk) => tk.slug),
    [catalogData],
  );
  const resolveBrand = useToolkitBrandResolver();
  return useCallback(
    (action) => {
      if (!action) return undefined;
      const toolkit = toolkitOfActionSlug(action, slugs);
      const brand = resolveBrand(toolkit);
      if (!brand) return undefined;
      return {
        name: brand.name,
        logoUrl: brand.logoUrl,
        actionLabel: humanizeActionGerund(action, toolkit),
      };
    },
    [slugs, resolveBrand],
  );
}
