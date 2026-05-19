#!/usr/bin/env node
// ============================================================================
// Enrich the Composio toolkit catalog with semantic metadata for the
// Stack Recommender (V1 — keyword + LLM pre-filter, no embeddings).
//
// Pipeline:
//   1. Fetch GET /api/v3/toolkits from Composio (~1000 entries)
//   2. For each toolkit, call Claude Haiku to generate enriched fields:
//        - oneLiner          (one sentence, plain language)
//        - useCases          (3-5 short phrases, what users hire it for)
//        - keywords          (8-15 synonyms / common terms)
//        - typicalCombos     (slugs of toolkits often paired with this)
//        - alternatives      (slugs of equivalent toolkits)
//        - pricingTier       ("free" | "freemium" | "paid")
//        - primaryCategory   (single canonical category, lowercase-dashed)
//   3. Write engine/houston-composio/data/catalog-enriched.json
//
// Idempotent + resumable: re-running picks up where it left off by reading
// the existing output and skipping toolkits already enriched. Slugs not in
// the upstream catalog anymore get pruned.
//
// Requirements:
//   - Node >= 20 (uses built-in fetch)
//   - env COMPOSIO_API_KEY   — your Composio user API key
//   - env ANTHROPIC_API_KEY  OR  env GEMINI_API_KEY  — your DEV LLM key.
//     This is used once offline to enrich the catalog. End users never
//     see this key — they use their own provider CLI at runtime. If both
//     are set, Anthropic wins.
//
// Usage:
//   COMPOSIO_API_KEY=... ANTHROPIC_API_KEY=... node scripts/enrich-composio-catalog.mjs
//   COMPOSIO_API_KEY=... GEMINI_API_KEY=...    node scripts/enrich-composio-catalog.mjs
//   COMPOSIO_API_KEY=... GEMINI_API_KEY=...    node scripts/enrich-composio-catalog.mjs --force-refresh
//
// Cost: ~1000 toolkits × ~800 tokens:
//   - claude-haiku-4-5     ≈ $0.50 total
//   - gemini-3.1-flash-lite ≈ $0.10 total ($0.25/$1.50 per 1M tokens)
// Time: ~15 minutes with concurrency 5 (Gemini 3.1 Flash Lite is ~2.5× faster than 2.5 Flash).
// ============================================================================

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUTPUT_PATH = join(
  REPO_ROOT,
  "engine",
  "houston-composio",
  "data",
  "catalog-enriched.json",
);

const COMPOSIO_BASE = "https://backend.composio.dev";
const CONCURRENCY = 5;
const MAX_OUTPUT_TOKENS = 800;

const ANTHROPIC_MODEL = "claude-haiku-4-5";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1/messages";

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const FORCE_REFRESH = process.argv.includes("--force-refresh");

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!COMPOSIO_API_KEY) {
  console.error("Missing env COMPOSIO_API_KEY");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY && !GEMINI_API_KEY) {
  console.error("Missing env ANTHROPIC_API_KEY or GEMINI_API_KEY (need one).");
  process.exit(1);
}

// Pick provider. Anthropic wins if both are set (more rigorous JSON adherence).
const LLM_PROVIDER = ANTHROPIC_API_KEY ? "anthropic" : "gemini";
const LLM_LABEL = LLM_PROVIDER === "anthropic" ? ANTHROPIC_MODEL : GEMINI_MODEL;
console.log(`Using LLM provider: ${LLM_PROVIDER} (${LLM_LABEL})`);

// ---------------------------------------------------------------------------
// Step 1 — Fetch the raw Composio catalog
// ---------------------------------------------------------------------------

async function fetchCatalog() {
  const url = `${COMPOSIO_BASE}/api/v3/toolkits?limit=1000`;
  const res = await fetch(url, {
    headers: {
      "x-user-api-key": COMPOSIO_API_KEY,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Composio API ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  const items = Array.isArray(body.items) ? body.items : [];
  return items
    .map((raw) => {
      const slug = String(raw.slug ?? "").toLowerCase();
      if (!slug) return null;
      const name = String(raw.name ?? slug);
      const description = String(raw?.meta?.description ?? "");
      const logoUrl =
        String(raw?.meta?.logo ?? "") ||
        `https://logos.composio.dev/api/${slug}`;
      const categories = Array.isArray(raw?.meta?.categories)
        ? raw.meta.categories
            .map((c) => (typeof c?.name === "string" ? c.name : null))
            .filter(Boolean)
        : [];
      return { slug, name, description, logoUrl, categories };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Step 2 — Enrich each toolkit via Claude Haiku
// ---------------------------------------------------------------------------

function buildPrompt(toolkit) {
  return `You are enriching a software integration catalog entry.

Toolkit slug: ${toolkit.slug}
Display name: ${toolkit.name}
Official description: ${toolkit.description || "(none)"}
Categories: ${toolkit.categories.join(", ") || "(none)"}

Generate a JSON object with these exact fields and nothing else:
{
  "oneLiner": "Single plain-English sentence (max 20 words) describing what this tool does for an end user. No marketing fluff.",
  "useCases": ["3 to 5 short phrases (max 8 words each) describing what people hire this tool to do"],
  "keywords": ["8 to 15 lowercase synonyms or task-words a non-technical user might say when wanting this tool's job done. Include verbs (send, notify, schedule), object nouns (email, invoice, ticket), and common informal names. IMPORTANT: include BOTH singular AND plural forms of important nouns (lead/leads, ticket/tickets, invoice/invoices, etc.) so the matcher catches either phrasing"],
  "typicalCombos": ["slugs of 1-4 other tools commonly used WITH this one in a workflow. Lowercase slugs only. Empty array if none obvious."],
  "alternatives": ["slugs of 1-4 tools that DO THE SAME JOB. Lowercase slugs only. Empty array if it's truly unique."],
  "pricingTier": "free | freemium | paid",
  "primaryCategory": "single lowercase-dashed canonical category like crm, email-marketing, transactional-email, form-builder, lead-enrichment, analytics, project-management, code-hosting, file-storage, calendar, scheduling, communication, ai-llm, payment, accounting, hr-payroll, customer-support, marketing-automation, social-media, e-commerce, database, devops-monitoring, etc."
}

Return ONLY valid JSON, no markdown fences, no commentary.`;
}

async function callLLM(prompt) {
  if (LLM_PROVIDER === "anthropic") {
    return callAnthropic(prompt);
  }
  return callGemini(prompt);
}

async function callAnthropic(prompt) {
  const res = await fetch(ANTHROPIC_BASE, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  const text = body?.content?.[0]?.text ?? "";
  return text.trim();
}

async function callGemini(prompt) {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text.trim();
}

function parseEnrichment(raw, toolkit) {
  // Strip any code fences just in case.
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  }
  const parsed = JSON.parse(cleaned);
  // Validate shape and coerce.
  return {
    oneLiner: String(parsed.oneLiner ?? toolkit.description ?? "").trim(),
    useCases: toStringArray(parsed.useCases, 5),
    keywords: toStringArray(parsed.keywords, 15).map((s) => s.toLowerCase()),
    typicalCombos: toStringArray(parsed.typicalCombos, 4).map((s) =>
      s.toLowerCase(),
    ),
    alternatives: toStringArray(parsed.alternatives, 4).map((s) =>
      s.toLowerCase(),
    ),
    pricingTier: ["free", "freemium", "paid"].includes(parsed.pricingTier)
      ? parsed.pricingTier
      : "freemium",
    primaryCategory: String(parsed.primaryCategory ?? "uncategorized")
      .toLowerCase()
      .replace(/\s+/g, "-"),
  };
}

function toStringArray(value, max) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// Step 3 — Drive the pipeline with concurrency + resume
// ---------------------------------------------------------------------------

async function enrichOne(toolkit) {
  const prompt = buildPrompt(toolkit);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await callLLM(prompt);
      const enriched = parseEnrichment(raw, toolkit);
      return { ...toolkit, ...enriched };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[${toolkit.slug}] attempt ${attempt} failed: ${msg}`);
      if (attempt === 3) {
        // Deterministic fallback so a flaky API doesn't break the whole run.
        return {
          ...toolkit,
          oneLiner: toolkit.description || toolkit.name,
          useCases: [],
          keywords: [toolkit.slug, toolkit.name.toLowerCase()],
          typicalCombos: [],
          alternatives: [],
          pricingTier: "freemium",
          primaryCategory: (toolkit.categories[0] || "uncategorized")
            .toLowerCase()
            .replace(/\s+/g, "-"),
          enrichmentFailed: true,
        };
      }
      // Exponential backoff.
      await sleep(500 * attempt * attempt);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runWithConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
        done++;
        if (done % 25 === 0 || done === items.length) {
          console.log(`  enriched ${done}/${items.length}`);
        }
      }
    }),
  );
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function loadExisting() {
  if (FORCE_REFRESH || !existsSync(OUTPUT_PATH)) return new Map();
  try {
    const raw = await readFile(OUTPUT_PATH, "utf8");
    const data = JSON.parse(raw);
    const entries = Array.isArray(data?.toolkits) ? data.toolkits : [];
    return new Map(entries.map((e) => [e.slug, e]));
  } catch (err) {
    console.warn("Could not read existing enriched catalog, starting fresh:", err);
    return new Map();
  }
}

async function main() {
  console.log("Fetching Composio toolkit catalog…");
  const catalog = await fetchCatalog();
  console.log(`  got ${catalog.length} toolkits`);

  const existing = await loadExisting();
  const liveSlugs = new Set(catalog.map((t) => t.slug));
  // Drop entries no longer in the upstream catalog.
  for (const slug of existing.keys()) {
    if (!liveSlugs.has(slug)) existing.delete(slug);
  }

  const todo = catalog.filter((t) => !existing.has(t.slug));
  console.log(
    `  ${existing.size} already enriched, ${todo.length} to enrich (force=${FORCE_REFRESH})`,
  );

  if (todo.length > 0) {
    console.log(`Enriching ${todo.length} toolkits with ${LLM_LABEL}…`);
    const start = Date.now();

    // Save progress every 50 entries so a crash doesn't lose the whole run.
    let lastSave = 0;
    await runWithConcurrency(
      todo,
      async (toolkit) => {
        const enriched = await enrichOne(toolkit);
        existing.set(toolkit.slug, enriched);
        if (existing.size - lastSave >= 50) {
          lastSave = existing.size;
          await saveOutput(existing);
        }
      },
      CONCURRENCY,
    );

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  done in ${elapsed}s`);
  }

  await saveOutput(existing);
  const failures = [...existing.values()].filter((e) => e.enrichmentFailed)
    .length;
  console.log(
    `Wrote ${existing.size} toolkits → ${OUTPUT_PATH}${failures ? ` (${failures} fallback entries)` : ""}`,
  );
}

async function saveOutput(map) {
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  const sorted = [...map.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    model: LLM_LABEL,
    toolkits: sorted,
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
