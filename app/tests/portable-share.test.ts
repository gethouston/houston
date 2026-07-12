import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import type { PortableAnonymizeResponse } from "@houston-ai/engine-client";
import {
  type AnonymizeAccept,
  buildAnonymizeOverrides,
  buildStorePublishRequest,
  droppedLearningIds,
  isListingComplete,
  type ListingForm,
  normalizeTags,
  toExportSelection,
  type WizardSelection,
} from "../src/lib/portable-share.ts";

function selection(): WizardSelection {
  return {
    claudeMd: true,
    skillSlugs: new Set(["a", "b"]),
    routineIds: new Set(["r1"]),
    learningIds: new Set(["l1", "l2"]),
  };
}

const anonymized: PortableAnonymizeResponse = {
  claudeMd: { before: "x", after: "X", summary: "", becameEmpty: false },
  skills: [
    { id: "a", before: "s", after: "S", summary: "", becameEmpty: false },
  ],
  routines: [
    { id: "r1", fieldDiffs: [], overridePayload: { name: null, prompt: "P" } },
  ],
  learnings: [
    { id: "l1", before: "k", after: "K", summary: "", becameEmpty: false },
    { id: "l2", before: "e", after: "", summary: "", becameEmpty: true },
  ],
  mode: "ai",
};

const allAccepted: AnonymizeAccept = {
  claudeMd: true,
  skills: { a: true },
  routines: { r1: true },
  learnings: { l1: true, l2: true },
};

describe("normalizeTags", () => {
  it("trims, drops blanks, de-dupes case-insensitively, caps at 6", () => {
    deepStrictEqual(normalizeTags([" Sales ", "sales", "", "  "]), ["Sales"]);
    deepStrictEqual(normalizeTags(["1", "2", "3", "4", "5", "6", "7"]), [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });
});

describe("buildAnonymizeOverrides", () => {
  it("returns undefined when not anonymizing", () => {
    strictEqual(
      buildAnonymizeOverrides(false, anonymized, allAccepted),
      undefined,
    );
    strictEqual(buildAnonymizeOverrides(true, null, allAccepted), undefined);
  });

  it("carries only the accepted redactions", () => {
    const ov = buildAnonymizeOverrides(true, anonymized, allAccepted);
    strictEqual(ov?.claudeMd, "X");
    deepStrictEqual(ov?.skillBodies, { a: "S" });
    deepStrictEqual(ov?.routineFields, { r1: { name: null, prompt: "P" } });
    deepStrictEqual(ov?.learningTexts, { l1: "K", l2: "" });
  });

  it("drops overrides the user chose to skip", () => {
    const ov = buildAnonymizeOverrides(true, anonymized, {
      claudeMd: false,
      skills: { a: false },
      routines: { r1: false },
      learnings: { l1: false, l2: false },
    });
    deepStrictEqual(ov, {});
  });
});

describe("droppedLearningIds", () => {
  it("drops learnings that emptied and were not kept", () => {
    const dropped = droppedLearningIds(true, anonymized, {
      ...allAccepted,
      learnings: { l1: true, l2: false },
    });
    ok(dropped.has("l2"));
    ok(!dropped.has("l1"));
  });

  it("drops nothing without anonymize", () => {
    strictEqual(droppedLearningIds(false, anonymized, allAccepted).size, 0);
  });
});

describe("toExportSelection", () => {
  it("maps Sets to arrays and filters dropped learnings", () => {
    const sel = toExportSelection(selection(), new Set(["l2"]));
    strictEqual(sel.includeClaudeMd, true);
    deepStrictEqual(sel.includeSkillSlugs.sort(), ["a", "b"]);
    deepStrictEqual(sel.includeRoutineIds, ["r1"]);
    deepStrictEqual(sel.includeLearningIds, ["l1"]);
  });
});

describe("isListingComplete", () => {
  const base: ListingForm = {
    description: "does things",
    tagline: "",
    category: "finance",
    tags: [],
    creatorName: "Ada",
    creatorUrl: "",
  };
  it("requires description, a real category, and a creator name", () => {
    ok(isListingComplete(base));
    ok(!isListingComplete({ ...base, description: "  " }));
    ok(!isListingComplete({ ...base, category: "nope" }));
    ok(!isListingComplete({ ...base, creatorName: "" }));
  });
});

describe("buildStorePublishRequest", () => {
  it("assembles identity + creator, trimming and omitting empty optionals", () => {
    const req = buildStorePublishRequest({
      name: "  Bookkeeper  ",
      form: {
        description: "  Keeps books  ",
        tagline: "  ",
        category: "finance",
        tags: ["books", "books", "money"],
        creatorName: "  Ada  ",
        creatorUrl: "  ",
      },
      selection: toExportSelection(selection(), new Set()),
      anonymized: true,
    });
    strictEqual(req.identity.name, "Bookkeeper");
    strictEqual(req.identity.description, "Keeps books");
    ok(!("tagline" in req.identity));
    deepStrictEqual(req.identity.tags, ["books", "money"]);
    strictEqual(req.creator.displayName, "Ada");
    ok(!("url" in req.creator));
    strictEqual(req.anonymized, true);
  });

  it("keeps tagline and url when present", () => {
    const req = buildStorePublishRequest({
      name: "A",
      form: {
        description: "d",
        tagline: "quick",
        category: "other",
        tags: [],
        creatorName: "N",
        creatorUrl: "https://x.dev",
      },
      selection: toExportSelection(selection(), new Set()),
      anonymized: false,
    });
    strictEqual(req.identity.tagline, "quick");
    strictEqual(req.creator.url, "https://x.dev");
  });
});
