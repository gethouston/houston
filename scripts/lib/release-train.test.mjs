import { describe, expect, it } from "vitest";
import {
  buildInternalChangelog,
  buildWhatsAppDraft,
  cmpSemver,
  issueKeysFromText,
  pickPrevPublished,
  prNumbersFromCommits,
  reporterPhones,
  semver,
} from "./release-train.mjs";

const commit = (subject) => ({ commit: { message: `${subject}\n\nbody` } });

describe("semver", () => {
  it("parses cloud-v tags and rejects everything else", () => {
    expect(semver("cloud-v0.5.26")).toEqual([0, 5, 26]);
    expect(semver("v0.4.29")).toBeNull();
    expect(semver("cloud-latest")).toBeNull();
    expect(semver("cloud-v0.5")).toBeNull();
    expect(semver(undefined)).toBeNull();
  });

  it("compares numerically, not lexically", () => {
    expect(cmpSemver([0, 5, 9], [0, 5, 10])).toBeLessThan(0);
    expect(cmpSemver([0, 10, 0], [0, 9, 9])).toBeGreaterThan(0);
    expect(cmpSemver([1, 2, 3], [1, 2, 3])).toBe(0);
  });
});

describe("pickPrevPublished", () => {
  const rel = (tag, draft) => ({ tag_name: tag, draft });

  it("skips drafts so an unshipped train rolls into the next one", () => {
    const prev = pickPrevPublished(
      [
        rel("cloud-v0.5.25", true),
        rel("cloud-v0.5.24", false),
        rel("cloud-v0.5.21", false),
      ],
      [0, 5, 26],
    );
    expect(prev.tag_name).toBe("cloud-v0.5.24");
  });

  it("ignores non-cloud tags and releases at or above the current cut", () => {
    const prev = pickPrevPublished(
      [
        rel("v0.4.29", false),
        rel("cloud-v0.5.26", false),
        rel("cloud-v0.5.20", false),
      ],
      [0, 5, 26],
    );
    expect(prev.tag_name).toBe("cloud-v0.5.20");
    expect(pickPrevPublished([rel("v0.4.29", false)], [0, 5, 26])).toBeNull();
  });
});

describe("prNumbersFromCommits", () => {
  it("reads squash subjects", () => {
    expect(prNumbersFromCommits([commit("feat: thing (#1049)")])).toEqual(
      new Set([1049]),
    );
  });

  it("reads merge-commit subjects (the style the old regex dropped)", () => {
    expect(
      prNumbersFromCommits([
        commit("Merge pull request #1061 from gethouston/feat/chat"),
      ]),
    ).toEqual(new Set([1061]));
  });

  it("ignores inner commits of a merged branch and issue refs in subjects", () => {
    expect(
      prNumbersFromCommits([
        commit("fix: surface the real cause (HOU-823)"),
        commit("feat: emoji space-invaders (#1063)"),
      ]),
    ).toEqual(new Set([1063]));
  });
});

describe("issueKeysFromText", () => {
  it("accepts the magic words in every casing, with lists", () => {
    expect(
      issueKeysFromText(
        "Fixes HOU-123\ncloses: HOU-4, and HOU-5\nResolved HOU-6",
      ),
    ).toEqual(new Set(["HOU-123", "HOU-4", "HOU-5", "HOU-6"]));
  });

  it("does not treat a bare mention as a resolution claim", () => {
    expect(issueKeysFromText("context: HOU-500, follow-up of HOU-501")).toEqual(
      new Set(),
    );
  });
});

describe("reporterPhones", () => {
  it("reads the phones line with or without bold markers", () => {
    expect(reporterPhones("📱 **Reporter phone(s):** +57 300, +57 301")).toBe(
      "+57 300, +57 301",
    );
    expect(reporterPhones("📱 Reporter phone(s): +57 300")).toBe("+57 300");
    expect(reporterPhones("no phones here")).toBeNull();
  });
});

describe("changelogs", () => {
  const stamped = [
    {
      key: "HOU-1",
      title: "Fix login",
      project: "Auth",
      isUserBug: true,
      phones: "+57 300",
    },
    {
      key: "HOU-2",
      title: "New board",
      project: "(no project)",
      isUserBug: false,
      phones: null,
    },
  ];

  it("groups the internal changelog by project and marks user bugs", () => {
    const body = buildInternalChangelog(stamped, "cloud-v0.5.27");
    expect(body).toContain("## Linear — cloud-v0.5.27");
    expect(body).toContain("**Auth**\n- HOU-1 — Fix login 🐛");
    expect(body).toContain("**(no project)**\n- HOU-2 — New board");
  });

  it("drafts the WhatsApp message and the reporter checklist", () => {
    const wa = buildWhatsAppDraft(stamped);
    expect(wa).toContain("✅ Fix login");
    expect(wa).toContain("- HOU-1 → +57 300");
    expect(buildWhatsAppDraft([stamped[1]])).not.toContain("Notify reporters");
  });
});
