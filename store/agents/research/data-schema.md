# Research  -  Data Schema

All records share these base fields:

```ts
interface BaseRecord {
  id: string;          // UUID v4
  createdAt: string;   // ISO-8601 UTC
  updatedAt: string;   // ISO-8601 UTC
}
```

All writes are atomic: write `*.tmp`, then rename onto the target
path. Never edit in-place. **Never write anywhere under
`.houston/<agent-path>/`**  -  the Houston file watcher skips that
prefix and dashboard reactivity breaks.

---

## Table of contents

1. [Config  -  the context ledger](#config---the-context-ledger)
2. [outputs.json  -  the single index](#outputsjson---the-single-index)
3. [Index files](#index-files)
4. [Artifact folders](#artifact-folders)
5. [Write rules](#write-rules)

---

## Config  -  the context ledger

Nothing under `config/` is shipped in the repo. Every field appears
at runtime, written by the first skill that needs it.

### `config/context-ledger.json`

Single living file that every skill reads first. Shape:

```ts
interface ContextLedger {
  universal: {
    company?: {
      name: string;
      website?: string;
      pitch30s?: string;
      stage?: "idea" | "mvp" | "early" | "growth" | "scale";
    };
    industry?: {
      primary: string;
      adjacent?: string[];
    };
    ideal_customer?: {
      roles: string[];
      companySize?: string;
      pains: string[];
    };
  };
  domains: {
    competitive?: {
      known_competitors: string[];
      monitoring_keywords: string[];
      capturedAt: string;
    };
    market?: {
      primary_market: string;
      last_market_brief?: string;
      capturedAt: string;
    };
    prospects?: {
      typical_meeting_purpose?: string;
      capturedAt: string;
    };
    monitoring?: {
      watchlist_alert_day: string; // default "Monday"
      capturedAt: string;
    };
  };
}
```

**Capture rule.** Every skill declares which ledger fields it needs.
Before doing work, it reads the ledger; for any missing field it
asks ONE targeted question, writes the field atomically, continues.
Never asks the same field twice.

---

## `outputs.json`  -  the single index

```ts
interface OutputRow extends BaseRecord {
  type:
    | "competitor-profile" | "comparison"
    | "dossier" | "trend-report"
    | "market-research" | "similar-companies"
    | "due-diligence"
    | "watchlist-add" | "watchlist-update"
    | "monthly-digest";
  title: string;
  summary: string;
  path: string;
  domain: "competitive" | "market" | "prospects" | "monitoring";
}
```

Rules:
- On update: refresh `updatedAt`, never touch `createdAt`.
- **Never** overwrite the whole array  -  read, merge, write.

---

## Index files

All at agent root.

| File | Written by | Shape |
|---|---|---|
| `competitors.json` | `profile-a-competitor` | `{ slug, name, url, last_updated, brief_path }` |
| `watchlist.json` | `monitor-competitor` | `{ slug, name, url, added_at, last_checked, baseline_path, focus_areas: string[] }` |
| `prospects.json` | `build-a-dossier` | `{ slug, name, type: "person"\|"company", last_researched, meeting_purpose, path }` |
| `comparisons-index.json` | `compare-competitors` | `{ slug, companies: string[], created_at, path }` |

---

## Artifact folders

All at agent root.

| Folder | Written by | Notes |
|---|---|---|
| `briefs/{slug}.md` | `profile-a-competitor` | Full competitor profile. |
| `comparisons/{slug}.md` | `compare-competitors` | Side-by-side comparison table. |
| `dossiers/{slug}-{YYYY-MM-DD}.md` | `build-a-dossier` | Meeting-ready brief. |
| `trends/{topic-slug}-{YYYY-MM-DD}.md` | `track-a-trend` | Themed trend report. |
| `market-briefs/{market-slug}.md` | `research-a-market` | Market overview brief. |
| `target-lists/{ref-slug}-similars-{YYYY-MM-DD}.md` | `find-similar-companies` | Lookalike company list. |
| `due-diligence/{slug}-{YYYY-MM-DD}.md` | `run-due-diligence` | Risk summary (GREEN/YELLOW/RED). |
| `watchlist-updates/{slug}-{YYYY-MM-DD}.md` | `monitor-competitor` routine | Change report for monitored company. |
| `pulses/{YYYY-MM-DD}.md` | Weekly competitor pulse routine | Rolled-up weekly watchlist changes. |
| `trends/monthly-digest-{YYYY-MM}.md` | Monthly market digest routine | Monthly trend + watchlist roll-up. |

---

## Write rules

- Skills always read `config/context-ledger.json` first.
- Skills always append to `outputs.json` last.
- Read-merge-write pattern for all index files (never overwrite).
- Slug format: kebab-cased, lowercase, no special chars.
- Every record carries `id` (UUID v4), `createdAt`, `updatedAt`.

---

## No cross-agent reads

This agent is self-contained. No `../{other-agent}/...` paths
anywhere in this agent's skills. Everything lives under this folder.
