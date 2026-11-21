import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { skillBodyOf } from "../src/lib/skill-md.ts";

describe("skillBodyOf", () => {
  it("strips the frontmatter block and trims", () => {
    strictEqual(
      skillBodyOf("---\nname: prep\ndescription: x\n---\n\n# Steps\n1. Go\n"),
      "# Steps\n1. Go",
    );
  });

  it("handles CRLF frontmatter", () => {
    strictEqual(
      skillBodyOf("---\r\nname: prep\r\n---\r\nBody here"),
      "Body here",
    );
  });

  it("returns content without frontmatter unchanged (trimmed)", () => {
    strictEqual(skillBodyOf("# Just steps\n"), "# Just steps");
  });

  it("does not treat a mid-document ruler as frontmatter", () => {
    strictEqual(skillBodyOf("Intro\n---\nMore"), "Intro\n---\nMore");
  });
});
