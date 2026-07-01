import assert from "node:assert/strict";
import test from "node:test";
import { classifyMarkdownLink } from "../src/markdown-link.ts";

test("bare auto-linked URL is an autolink (issue #358 — must stay clickable)", () => {
  assert.equal(
    classifyMarkdownLink("https://example.com", "https://example.com"),
    "autolink",
  );
});

test("labeled markdown link is labeled", () => {
  assert.equal(
    classifyMarkdownLink("https://example.com/report.pdf", "Open report"),
    "labeled",
  );
});

test("missing href is plain (nothing to open)", () => {
  assert.equal(classifyMarkdownLink(undefined, "text"), "plain");
  assert.equal(classifyMarkdownLink("", "text"), "plain");
  assert.equal(classifyMarkdownLink(null, "text"), "plain");
});

test("non-string children (React nodes) never match a string href → labeled", () => {
  // Streamdown can hand us an array/element for labeled links; only a bare
  // auto-linked URL yields children strictly equal to the href string.
  assert.equal(
    classifyMarkdownLink("https://example.com", ["https://example.com"]),
    "labeled",
  );
  assert.equal(
    classifyMarkdownLink("https://example.com", { href: "x" }),
    "labeled",
  );
});

test("relative path the agent dropped (perfil.md) classifies as autolink when shown bare", () => {
  // openAgentHref resolves non-URL hrefs against the agent dir; classification
  // only cares whether the visible text equals the href.
  assert.equal(classifyMarkdownLink("perfil.md", "perfil.md"), "autolink");
});
