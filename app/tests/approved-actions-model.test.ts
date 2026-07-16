import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { toolkitOfActionSlug } from "../src/components/tabs/agent-integrations/approved-actions-model.ts";

/**
 * The pure toolkit attribution the "Runs without asking" review uses to turn a
 * bare action slug into its app identity (logo + name). Longest catalog-slug
 * prefix wins; a first-segment fallback covers a catalog miss.
 */
describe("toolkitOfActionSlug", () => {
  const catalog = ["gmail", "google_maps", "google", "slack", "github"];

  it("resolves a simple single-word toolkit prefix", () => {
    strictEqual(toolkitOfActionSlug("GMAIL_SEND_DRAFT", catalog), "gmail");
  });

  it("longest matching slug wins over the first segment", () => {
    // Both `google` and `google_maps` are catalog slugs and both prefix the
    // action; the longer, more specific one must win.
    strictEqual(
      toolkitOfActionSlug("GOOGLE_MAPS_SEARCH", catalog),
      "google_maps",
    );
  });

  it("matches an exact toolkit slug (action equals the slug)", () => {
    strictEqual(toolkitOfActionSlug("SLACK", catalog), "slack");
  });

  it("falls back to the first underscore segment when nothing matches", () => {
    strictEqual(toolkitOfActionSlug("NOTION_CREATE_PAGE", catalog), "notion");
  });

  it("falls back to the first segment with an empty catalog", () => {
    strictEqual(toolkitOfActionSlug("GMAIL_SEND_DRAFT", []), "gmail");
  });

  it("never returns a partial-word false prefix", () => {
    // `git` is not a catalog slug, and `github` does not prefix `GITLAB_*`, so
    // the first-segment fallback ("gitlab") is used, not "github".
    strictEqual(toolkitOfActionSlug("GITLAB_OPEN_MR", catalog), "gitlab");
  });
});
