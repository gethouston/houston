import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  fullPortableSelection,
  suggestCopyName,
} from "../src/components/agent-actions/copy-agent-model.ts";

const MAX = 60;

describe("suggestCopyName", () => {
  it("suffixes the first copy and counts up past taken names", () => {
    strictEqual(
      suggestCopyName("Ops Bot", ["Ops Bot"], "copy", MAX),
      "Ops Bot copy",
    );
    strictEqual(
      suggestCopyName("Ops Bot", ["Ops Bot", "Ops Bot copy"], "copy", MAX),
      "Ops Bot copy 2",
    );
    strictEqual(
      suggestCopyName(
        "Ops Bot",
        ["Ops Bot", "Ops Bot copy", "Ops Bot copy 2"],
        "copy",
        MAX,
      ),
      "Ops Bot copy 3",
    );
  });

  it("matches taken names case-insensitively, like the name validator", () => {
    strictEqual(
      suggestCopyName("Ops Bot", ["ops bot COPY"], "copy", MAX),
      "Ops Bot copy 2",
    );
  });

  it("trims the base name so the suffix always fits the length cap", () => {
    const name = "A".repeat(MAX);
    const suggested = suggestCopyName(name, [name], "copy", MAX);
    ok(suggested.length <= MAX);
    ok(suggested.endsWith(" copy"));
  });

  it("returns the plain first candidate when everything is taken", () => {
    const taken = ["Bot"];
    for (let n = 1; n <= 99; n++) {
      taken.push(n === 1 ? "Bot copy" : `Bot copy ${n}`);
    }
    // The dialog's live validation names the conflict; inventing an unrelated
    // name here would be dishonest.
    strictEqual(suggestCopyName("Bot", taken, "copy", MAX), "Bot copy");
  });

  it("speaks the localized copy word", () => {
    strictEqual(suggestCopyName("Bot", ["Bot"], "copia", MAX), "Bot copia");
  });
});

describe("fullPortableSelection", () => {
  it("selects everything the preview offers", () => {
    deepStrictEqual(
      fullPortableSelection({
        claudeMd: { byteCount: 17, excerpt: "You are Ops Bot." },
        skills: [
          {
            slug: "invoices",
            description: "",
            category: null,
            image: null,
            integrations: [],
            featured: false,
          },
          {
            slug: "reports",
            description: "",
            category: null,
            image: null,
            integrations: [],
            featured: false,
          },
        ],
        routines: [
          {
            id: "r1",
            name: "Daily",
            promptExcerpt: "",
            enabled: true,
            integrations: [],
          },
        ],
        learnings: [{ id: "l1", text: "", createdAt: "2026-08-31" }],
      }),
      {
        includeClaudeMd: true,
        includeSkillSlugs: ["invoices", "reports"],
        includeRoutineIds: ["r1"],
        includeLearningIds: ["l1"],
      },
    );
  });

  it("skips the job description only when the agent has none", () => {
    const selection = fullPortableSelection({
      claudeMd: null,
      skills: [],
      routines: [],
      learnings: [],
    });
    deepStrictEqual(selection, {
      includeClaudeMd: false,
      includeSkillSlugs: [],
      includeRoutineIds: [],
      includeLearningIds: [],
    });
  });
});
