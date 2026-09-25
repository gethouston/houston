import { expect, test } from "vitest";
import { composeJobDescription } from "./job-description";
import {
  AGENT_ROLE_PART_MAX_LENGTH,
  jobDescriptionRole,
  normalizeRolePart,
} from "./job-role";

test("names the role a job description's block holds, normalized", () => {
  const text = composeJobDescription({
    industry: "Healthcare",
    role: "Medical coder",
    body: "Codes charts.",
  });
  expect(jobDescriptionRole(text)).toBe("Medical coder");
  expect(jobDescriptionRole("---\nrole: '  Medical​   coder '\n---\n\nx")).toBe(
    "Medical coder",
  );
});

test("a role alone is still the role (no industry needed to name the job)", () => {
  expect(jobDescriptionRole("---\nrole: Bookkeeper\n---\n")).toBe("Bookkeeper");
});

test("names nothing for an absent, plain, or blank-role description", () => {
  expect(jobDescriptionRole(undefined)).toBeUndefined();
  expect(jobDescriptionRole(null)).toBeUndefined();
  expect(jobDescriptionRole("")).toBeUndefined();
  expect(jobDescriptionRole("# Notes\n\nJust notes.")).toBeUndefined();
  expect(jobDescriptionRole("---\nrole: '​  '\n---\n")).toBeUndefined();
});

test("a pasted page is capped to one label", () => {
  const role = jobDescriptionRole(`---\nrole: ${"a".repeat(200)}\n---\n`);
  expect(role).toHaveLength(AGENT_ROLE_PART_MAX_LENGTH);
  expect(normalizeRolePart(" a \n b ")).toBe("a b");
});
