import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SentCitation } from "@houston/wire-types";
import type { TFunction } from "i18next";
import { sentPillGroups } from "../src/components/file-preview/citation-labels.ts";

const t = ((key: string) => key) as unknown as TFunction<"agents">;
const pill = (n: number, filePath: string): SentCitation => ({
  n,
  filePath,
  fileName: "deck.pptx",
  page: 1,
  kind: "area",
  comment: `c${n}`,
});

describe("sent comment pills", () => {
  it("keeps two same-named files in different folders apart", () => {
    const groups = sentPillGroups(
      t,
      [
        pill(1, "q1/deck.pptx"),
        pill(2, "q2/deck.pptx"),
        pill(3, "q1/deck.pptx"),
      ],
      [],
    );
    assert.deepEqual(
      groups.map((g) => [g.filePath, g.citations.map((c) => c.n)]),
      [
        ["q1/deck.pptx", [1, 3]],
        ["q2/deck.pptx", [2]],
      ],
    );
  });
});
