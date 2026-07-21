import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  classifyMarkdownLink,
  markdownLinkText,
} from "../src/markdown-link.ts";

describe("markdownLinkText", () => {
  it("passes strings and numbers through", () => {
    assert.equal(markdownLinkText("hello"), "hello");
    assert.equal(markdownLinkText(42), "42");
  });

  it("concatenates arrays of text-like nodes", () => {
    assert.equal(
      markdownLinkText(["https://", "example.com"]),
      "https://example.com",
    );
  });

  it("unwraps element-like nodes via props.children (streaming animation spans)", () => {
    const span = { props: { children: "https://example.com" } };
    assert.equal(markdownLinkText(span), "https://example.com");
    assert.equal(
      markdownLinkText([{ props: { children: ["a", "b"] } }, "c"]),
      "abc",
    );
  });

  it("returns null for non-text nodes", () => {
    assert.equal(markdownLinkText({ href: "x" }), null);
    assert.equal(markdownLinkText(["text", { type: "img" }]), null);
    assert.equal(markdownLinkText(undefined), null);
  });
});

describe("classifyMarkdownLink", () => {
  it("bare auto-linked URL is an autolink (issue #358 — must stay clickable)", () => {
    assert.equal(
      classifyMarkdownLink("https://example.com", "https://example.com"),
      "autolink",
    );
  });

  it("URL text wrapped in an array or element is still an autolink (broken-pill bug)", () => {
    // Streamdown hands children as ["url"] or animation-wrapped spans; the old
    // strict children === href check dropped these into the labeled pill, which
    // clipped the URL into a black bar.
    assert.equal(
      classifyMarkdownLink("https://example.com", ["https://example.com"]),
      "autolink",
    );
    assert.equal(
      classifyMarkdownLink("https://example.com", {
        props: { children: "https://example.com" },
      }),
      "autolink",
    );
  });

  it("URL-as-label is an autolink even when it differs from the href", () => {
    // [https://drive.google.com/…/view](https://drive.google.com/…/view/) —
    // a visible URL must render inline, never as a pill.
    assert.equal(
      classifyMarkdownLink(
        "https://drive.google.com/file/d/1Vz7t/view/",
        "https://drive.google.com/file/d/1Vz7t/view",
      ),
      "autolink",
    );
  });

  it("percent-encoded href with decoded visible text is an autolink", () => {
    assert.equal(
      classifyMarkdownLink("my%20notes.md", "my notes.md"),
      "autolink",
    );
  });

  it("labeled markdown link is labeled", () => {
    assert.equal(
      classifyMarkdownLink("https://example.com/report.pdf", "Open report"),
      "labeled",
    );
    assert.equal(
      classifyMarkdownLink("https://example.com/report.pdf", [
        "Open ",
        { props: { children: "report" } },
      ]),
      "labeled",
    );
  });

  it("missing href is plain (nothing to open)", () => {
    assert.equal(classifyMarkdownLink(undefined, "text"), "plain");
    assert.equal(classifyMarkdownLink("", "text"), "plain");
    assert.equal(classifyMarkdownLink(null, "text"), "plain");
  });

  it("non-text children (e.g. image links) are labeled", () => {
    assert.equal(
      classifyMarkdownLink("https://example.com", { href: "x" }),
      "labeled",
    );
  });

  it("malformed percent-encoding in href never throws", () => {
    assert.equal(classifyMarkdownLink("bad%.md", "bad%.md"), "autolink");
    assert.equal(classifyMarkdownLink("bad%.md", "other"), "labeled");
  });

  it("relative path the agent dropped (perfil.md) classifies as autolink when shown bare", () => {
    // useOpenAgentHref resolves non-URL hrefs against the agent dir;
    // classification only cares whether the visible text equals the href.
    assert.equal(classifyMarkdownLink("perfil.md", "perfil.md"), "autolink");
  });
});
