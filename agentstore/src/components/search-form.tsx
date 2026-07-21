"use client";

import { cn } from "@houston-ai/core";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { resolveSearchTarget } from "@/lib/search-routing";

export interface SearchFormProps {
  /** Prefill value (the current query on /explore). */
  defaultValue?: string;
  /** Placeholder copy. */
  placeholder?: string;
  /** Visually hidden label text for the input. */
  label?: string;
  className?: string;
  /** Larger hero treatment vs. the compact in-page control. */
  size?: "lg" | "md";
}

/**
 * The catalog search box. It degrades to a plain GET form to /explore (works with
 * the keyboard and without hydration), and enhances with JS so a leading `@handle`
 * jumps to that creator's page instead of a full-text search. Every result URL
 * stays shareable and crawlable.
 */
export function SearchForm({
  defaultValue,
  placeholder = "Search agents",
  label = "Search agents",
  className,
  size = "md",
}: SearchFormProps) {
  const router = useRouter();
  const large = size === "lg";

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const value = new FormData(event.currentTarget).get("q");
    if (typeof value !== "string") return;
    event.preventDefault();
    router.push(resolveSearchTarget(value));
  }

  return (
    <search className={cn("relative block w-full", className)}>
      <form
        action="/explore"
        method="get"
        onSubmit={onSubmit}
        className="relative w-full"
      >
        <label htmlFor="agent-search" className="sr-only">
          {label}
        </label>
        <Search
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground",
            large ? "size-5" : "size-4",
          )}
        />
        <input
          id="agent-search"
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(
            "w-full rounded-full border border-input bg-card text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
            large
              ? "h-13 pr-28 pl-12 text-base sm:h-14"
              : "h-11 pr-24 pl-10 text-sm",
          )}
        />
        <button
          type="submit"
          className={cn(
            "absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full bg-primary font-medium text-primary-foreground transition-colors hover:bg-primary/70 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
            large ? "h-10 px-5 text-sm sm:h-11" : "h-8 px-4 text-sm",
          )}
        >
          Search
        </button>
      </form>
    </search>
  );
}
