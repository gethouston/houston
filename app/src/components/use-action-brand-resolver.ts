import { type ChatActionBrand, humanizeActionGerund } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useCustomIntegrations } from "../hooks/queries";
import {
  camelToSnakeCase,
  customActionOf,
  prettifyCustomSlug,
  toolkitOfActionSlug,
} from "./integrations/app-display";
import { useReadyToolkitCatalog } from "./integrations/use-toolkit-catalog";
import { useToolkitBrandResolver } from "./use-toolkit-brand-resolver";

/**
 * A read-only resolver from an `integration_execute` ACTION to the process
 * block header's branded row — the app-side counterpart to `ui/chat`'s
 * `resolveActionBrand` port (ui/chat stays provider-unaware).
 *
 * Two action grammars, one row:
 *
 * - A CUSTOM executor address (`tools.<slug>....<tool>`, HOU-1049) brands as
 *   the integration's own name — from the custom definitions list, else the
 *   prettified slug (a gateway-fronted web surface may null the list) — with
 *   the wrench glyph (`icon: "tool"`, these integrations have no logo) and
 *   the humanized tool name ("Listing jobs").
 * - A Composio action slug (e.g. `GMAIL_SEND_EMAIL`) resolves its toolkit as
 *   the longest catalog slug prefixing it (`toolkitOfActionSlug`), that
 *   toolkit resolves to a name + logo through the shared brand resolver, and
 *   the action humanizes to a present-tense label ("Sending email"). A
 *   catalog MISS still yields a branded row — the prettified toolkit name
 *   with NO logo — so the row degrades gracefully and never shows a raw slug
 *   or a broken image.
 *
 * Stable across renders unless the catalog or the custom list moves.
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
  const custom = useCustomIntegrations();
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
          icon: "tool",
          actionLabel: humanizeActionGerund(
            camelToSnakeCase(customRef.tool),
            "",
          ),
        };
      }
      const toolkit = toolkitOfActionSlug(action, slugs);
      const brand = resolveBrand(toolkit);
      if (!brand) return undefined;
      return {
        name: brand.name,
        logoUrl: brand.logoUrl,
        actionLabel: humanizeActionGerund(action, toolkit),
      };
    },
    [slugs, customDefs, resolveBrand],
  );
}
