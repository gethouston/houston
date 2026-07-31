import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  classifyMarkdownLink,
  collapsedUrlText,
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

  it("treats <br>/<wbr> break elements as whitespace, not non-text (HOU-1071)", () => {
    // A hard break inside a link label renders as a childless <br> element;
    // returning null here dropped wrapped-URL labels into the clipped pill.
    assert.equal(
      markdownLinkText(["https://a.com/x-", { type: "br", props: {} }, "\ny"]),
      "https://a.com/x-\n\ny",
    );
    assert.equal(markdownLinkText({ type: "wbr", props: {} }), "");
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

  it("URL label hard-wrapped across lines is an autolink (HOU-1071)", () => {
    // Agents wrap long URLs inside [label](href); the softbreak flattens
    // into the label as "\n". Pre-fix this fell into the pill branch and
    // clipped the URL into an unreadable black bar.
    assert.equal(
      classifyMarkdownLink(
        "https://docs.google.com/spreadsheets/d/1JOOOml-rR9Hmali/edit?usp=sharing",
        "https://docs.google.com/spreadsheets/d/1JOOOml-\nrR9Hmali/edit",
      ),
      "autolink",
    );
  });

  it("URL label hard-broken with <br> is an autolink (HOU-1071 live shape)", () => {
    // Trailing-space / backslash hard breaks render the wrapped label as
    // [text, <br>, text] — the exact shape from the issue screenshot.
    assert.equal(
      classifyMarkdownLink("https://docs.google.com/spreadsheets/d/1JO/edit", [
        "https://docs.google.com/spreadsheets/d/",
        { type: "br", props: {} },
        "\n1JO/edit",
      ]),
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

describe("collapsedUrlText", () => {
  it("reassembles a URL label markdown broke across lines", () => {
    assert.equal(
      collapsedUrlText("https://docs.google.com/spreadsheets/d/1JO-\nrR9/edit"),
      "https://docs.google.com/spreadsheets/d/1JO-rR9/edit",
    );
  });

  it("returns null for an unwrapped URL so streaming children render as-is", () => {
    assert.equal(collapsedUrlText("https://example.com"), null);
  });

  it("returns null for plain labels and non-text children", () => {
    assert.equal(collapsedUrlText("Open the sheet"), null);
    assert.equal(collapsedUrlText({ href: "x" }), null);
  });
});
