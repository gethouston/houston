import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useState } from "react";

/**
 * Shared display primitives for the Integrations rows: resolving a toolkit slug
 * to a real name / logo / description (with slug fallbacks when the catalog is
 * missing it), and the logo `<img>` with an initial-letter fallback. Kept out
 * of the row components so both the connect rows and the grant rows share one
 * source of truth. Real app names and logos, never machine slugs.
 */

/** Display info resolved from the catalog (slug fallbacks when absent). */
export interface AppDisplay {
  toolkit: string;
  name: string;
  description: string;
  logoUrl: string;
}

export function appDisplay(
  slug: string,
  toolkit: IntegrationToolkit | undefined,
): AppDisplay {
  return {
    toolkit: slug,
    name: toolkit?.name ?? slug,
    description: toolkit?.description ?? "",
    logoUrl: toolkit?.logoUrl || fallbackLogo(slug),
  };
}

/** Resolve + sort a connection list into display rows by app name. */
export function connectionRows(
  connections: IntegrationConnection[],
  catalog: IntegrationToolkit[],
): { connection: IntegrationConnection; app: AppDisplay }[] {
  const bySlug = new Map(catalog.map((tk) => [tk.slug, tk]));
  return connections
    .map((c) => ({
      connection: c,
      app: appDisplay(c.toolkit, bySlug.get(c.toolkit)),
    }))
    .sort((a, b) => a.app.name.localeCompare(b.app.name));
}

export function fallbackLogo(toolkit: string): string {
  return `https://www.google.com/s2/favicons?domain=${toolkit}.com&sz=128`;
}

export function Logo({ app }: { app: AppDisplay }) {
  const [imgError, setImgError] = useState(false);
  if (imgError) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background">
        <span className="text-xs font-semibold text-muted-foreground">
          {app.name.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }
  return (
    <img
      src={app.logoUrl}
      alt={app.name}
      className="size-8 shrink-0 rounded-lg bg-background object-contain"
      onError={() => setImgError(true)}
    />
  );
}
