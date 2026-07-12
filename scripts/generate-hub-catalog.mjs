#!/usr/bin/env node
// Regenerate the MCP hub's browsable app catalog from Composio's public
// toolkit metadata (names, slugs, logos, categories — no secrets):
//
//   COMPOSIO_API_KEY=<any project key> node scripts/generate-hub-catalog.mjs
//
// Writes packages/host/src/integrations/mcp/hub-catalog-data.ts. The key is
// only needed to READ the catalog; the generated file contains public data.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const key = process.env.COMPOSIO_API_KEY;
if (!key) {
  console.error("COMPOSIO_API_KEY is required (any Composio project key).");
  process.exit(1);
}

const toolkits = [];
let cursor;
for (let page = 0; page < 100; page++) {
  const url = new URL("https://backend.composio.dev/api/v3/toolkits");
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);
  const res = await fetch(url, { headers: { "x-api-key": key } });
  if (!res.ok) {
    console.error(`toolkits page failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const body = await res.json();
  toolkits.push(...(body.items ?? []));
  cursor = body.next_cursor ?? undefined;
  if (!cursor) break;
}

const entries = toolkits
  .map((t) => ({
    slug: t.slug,
    name: t.name,
    description: (t.meta?.description ?? "")
      .split(/[.!\n]/, 1)[0]
      .slice(0, 120),
    logoUrl: t.meta?.logo ?? `https://logos.composio.dev/api/${t.slug}`,
    categories: (t.meta?.categories ?? [])
      .map((c) => (typeof c === "string" ? c : (c?.slug ?? c?.name ?? "")))
      .filter(Boolean),
  }))
  .filter((t) => t.slug && t.name)
  .sort((a, b) => a.slug.localeCompare(b.slug));

const target = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages/host/src/integrations/mcp/hub-catalog.json",
);
writeFileSync(target, `${JSON.stringify(entries, null, 1)}\n`);
console.log(`wrote ${entries.length} toolkits to ${target}`);
