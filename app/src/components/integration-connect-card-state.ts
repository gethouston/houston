import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/engine-adapter";

export function parseToolkitFromHref(href: string): string | null {
  try {
    const url = new URL(href);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    if (!hash) return null;
    const slug = new URLSearchParams(hash).get("houston_toolkit");
    return slug && slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}

export function normalizeToolkitSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export function isToolkitConnected(
  connections: IntegrationConnection[] | undefined,
  toolkit: string,
  catalogEntry?: IntegrationToolkit,
  connectedAfter?: string,
): boolean {
  if (catalogEntry?.noAuth) return true;
  const slug = normalizeToolkitSlug(toolkit);
  const after = connectedAfter ? Date.parse(connectedAfter) : Number.NaN;
  const fresh = (c: IntegrationConnection) =>
    Number.isNaN(after) ||
    (c.createdAt !== undefined && Date.parse(c.createdAt) > after);
  return (connections ?? []).some(
    (c) =>
      c.status === "active" &&
      normalizeToolkitSlug(c.toolkit) === slug &&
      fresh(c),
  );
}

export function findCatalogToolkit(
  catalog: IntegrationToolkit[] | undefined,
  toolkit: string,
): IntegrationToolkit | undefined {
  const slug = normalizeToolkitSlug(toolkit);
  return (catalog ?? []).find((t) => normalizeToolkitSlug(t.slug) === slug);
}

export type ConnectCardView = "idle" | "connecting" | "connected";

export function deriveConnectCardView(
  isConnected: boolean,
  isConnecting: boolean,
): ConnectCardView {
  if (isConnected) return "connected";
  if (isConnecting) return "connecting";
  return "idle";
}

export function shouldAutoContinueConnected(args: {
  autoContinue: boolean;
  isConnected: boolean;
  catalogSettled: boolean;
  alreadyFired: boolean;
}): boolean {
  return (
    args.autoContinue &&
    args.isConnected &&
    args.catalogSettled &&
    !args.alreadyFired
  );
}

export function connectStepAutoContinues(args: {
  reconnect: boolean;
  refusedAt?: string;
  revisited: boolean;
}): boolean {
  return !args.revisited && (!args.reconnect || args.refusedAt !== undefined);
}

export function connectStepDone(args: {
  reconnect: boolean;
  refusedAt?: string;
  isConnected: boolean;
  reconnectedHere: boolean;
}): boolean {
  if (!args.reconnect) return args.isConnected;
  if (args.refusedAt !== undefined)
    return args.isConnected || args.reconnectedHere;
  return args.reconnectedHere;
}
