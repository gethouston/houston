import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { StorePage } from "@houston-ai/store";
import { ArrowUpDown, ChevronDown, Search } from "lucide-react";

import type { Specimen } from "../../../src/specimen";

/**
 * The store HOME, built from zero, one element at a time with the owner
 * reviewing each step live. Elements stabilize here first, then get promoted
 * into `@houston-ai/store` components.
 *
 * Step 1 — the title: the landing's `.sec-title` display recipe (very light
 * weight, large clamped size, 1.04 line-height, -0.02em tracking, balanced
 * wrap), system stack, ink token. Centered.
 *
 * Step 2 — the nav bar: the landing's `.lnav` shape (transparent bar, brand
 * wordmark left, centered links, pill CTA right), tokens only.
 */
const navLink =
  "text-sm text-ink-muted transition-colors duration-150 hover:text-ink";

function StoreHomeNav() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 md:px-10">
      <a href="#store-page" className="font-medium text-[22px] text-ink">
        Agent Store
      </a>
      <div className="hidden items-center gap-8 md:flex">
        <a href="#store-page" className={navLink}>
          Explore
        </a>
        <a href="#store-page" className={navLink}>
          Categories
        </a>
        <a href="#store-page" className={navLink}>
          Creators
        </a>
      </div>
      <button
        type="button"
        className="rounded-full bg-action px-4 py-2 font-medium text-action-text text-sm transition-colors duration-150"
      >
        Publish an agent
      </button>
    </nav>
  );
}

const CATEGORIES = [
  "All categories",
  "Productivity",
  "Sales",
  "Finance",
  "Support",
  "Marketing",
  "Engineering",
];

/**
 * Step 3 — the search row: one pill search field (bg-input, recessed on the
 * screen) with the category dropdown at its right edge.
 */
function StoreHomeSearch() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] items-center gap-3">
      <label className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full border border-line-input bg-input px-5 transition-colors duration-150 focus-within:ring-[3px] focus-within:ring-focus/30">
        <Search className="size-5 shrink-0 text-ink-muted" />
        <input
          type="text"
          placeholder="Search agents"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-muted focus:outline-none"
        />
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-12 shrink-0 items-center gap-2 rounded-full border border-line-input bg-input px-5 text-[15px] text-ink transition-colors duration-150 hover:bg-hover"
          >
            All categories
            <ChevronDown className="size-4 text-ink-muted" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {CATEGORIES.map((category) => (
            <DropdownMenuItem key={category}>{category}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Sort agents"
            className="grid size-12 shrink-0 place-items-center rounded-full border border-line-input bg-input text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
          >
            <ArrowUpDown className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuItem key={option}>{option}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const SORT_OPTIONS = ["Most installed", "Newest", "Name A to Z"];

const AGENTS = [
  {
    emoji: "📬",
    name: "Inbox Zero",
    blurb:
      "Triages your mail every morning and drafts the replies you approve.",
    meta: "Gmail · 4.2k installs",
  },
  {
    emoji: "📝",
    name: "Meeting Notes",
    blurb: "Joins the call, writes the summary, files the follow-ups.",
    meta: "Calendar · 3.1k installs",
  },
  {
    emoji: "📊",
    name: "Weekly Report",
    blurb: "Pulls the numbers on Friday and writes the update for you.",
    meta: "Sheets · 2.7k installs",
  },
  {
    emoji: "🧾",
    name: "Expense Filer",
    blurb: "Reads receipts from your inbox and files them by project.",
    meta: "Gmail · 1.9k installs",
  },
  {
    emoji: "📑",
    name: "Contract Reader",
    blurb: "Flags the clauses that matter before you sign anything.",
    meta: "Drive · 1.4k installs",
  },
  {
    emoji: "☀️",
    name: "Standup Buddy",
    blurb: "Collects what everyone shipped and posts the morning digest.",
    meta: "Slack · 980 installs",
  },
];

/**
 * Step 4 — the catalog: agent cards under the search row. The sort control
 * lives in the search row, right of the category dropdown. Cards are the
 * store language: glass card, hairline, hover shifts colour only.
 */
function StoreHomeCatalog() {
  return (
    <section className="flex w-full flex-col gap-4">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map((agent) => (
          <article
            key={agent.name}
            className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-line bg-card p-6 transition-colors duration-150 hover:bg-card-hover"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-chip text-xl">
              {agent.emoji}
            </span>
            <h3 className="font-medium text-[15px] text-ink">{agent.name}</h3>
            <p className="text-[15px] text-ink-muted leading-[1.55]">
              {agent.blurb}
            </p>
            <p className="mt-auto text-[13px] text-ink-muted">{agent.meta}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function StoreHomeSpecimen() {
  return (
    <div className="min-h-full">
      <StoreHomeNav />
      <StorePage>
        <div className="flex flex-col items-center gap-16">
          <h1 className="mx-auto max-w-[18ch] text-balance text-center font-light text-[clamp(32px,5vw,56px)] text-ink leading-[1.04] tracking-[-0.02em]">
            Hire your next teammate
          </h1>
          <StoreHomeSearch />
          <StoreHomeCatalog />
        </div>
      </StorePage>
    </div>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["StorePage"];

export const specimen: Specimen = {
  id: "store-page",
  title: "Home",
  group: "Agent Store",
  render: () => <StoreHomeSpecimen />,
};
