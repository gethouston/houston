import { expect, test } from "vitest";
import { multiAccountNote } from "./integrations-accounts";
import type { ToolMatch } from "./integrations-render";

const match = (accounts?: ToolMatch["accounts"]): ToolMatch => ({
  action: "GOOGLEDRIVE_LIST_FILES",
  toolkit: "googledrive",
  description: "List files",
  accounts,
});

test("multi-account note uses identity labels before connection dates", () => {
  const text = multiAccountNote([
    match([
      { id: "ca_1", label: "work@example.com", createdAt: "2026-07-28" },
      { id: "ca_2", label: "Team workspace" },
    ]),
  ]);
  expect(text).toContain(
    "- googledrive: ca_1 (work@example.com), ca_2 (Team workspace)",
  );
  expect(text).not.toContain("ca_1 (connected on");
});

test("multi-account note describes unnamed accounts by their connection date in UTC", () => {
  const text = multiAccountNote([
    match([
      { id: "ca_1", createdAt: "2026-07-28T00:30:00.000Z" },
      { id: "ca_2", label: " ", createdAt: "2026-08-01T23:30:00-05:00" },
    ]),
  ]);
  expect(text).toContain(
    "- googledrive: ca_1 (connected on July 28, 2026), ca_2 (connected on August 2, 2026)",
  );
});

test("multi-account note uses account ordinals when identity and a usable date are absent", () => {
  const text = multiAccountNote([
    match([
      { id: "ca_1" },
      { id: "ca_2", createdAt: "invalid" },
      { id: "ca_3", label: "", createdAt: "" },
    ]),
  ]);
  expect(text).toContain(
    "- googledrive: ca_1 (account 1), ca_2 (account 2), ca_3 (account 3)",
  );
});

test("multi-account note renders each app once across action matches", () => {
  const item = match([{ id: "ca_1" }, { id: "ca_2" }]);
  const text = multiAccountNote([
    item,
    { ...item, action: "GOOGLEDRIVE_GET_FILE" },
    { ...item, toolkit: "googlecalendar" },
  ]);
  expect(text.match(/- googledrive:/g)).toHaveLength(1);
  expect(text).toContain(
    "- googlecalendar: ca_1 (account 1), ca_2 (account 2)",
  );
});

test("multi-account note is absent for single-account apps and older results", () => {
  expect(multiAccountNote([match([{ id: "ca_1" }]), match()])).toBe("");
  expect(multiAccountNote([])).toBe("");
});

test("a mix of named and unnamed accounts requires one question before any action", () => {
  const text = multiAccountNote([
    match([{ id: "ca_1", label: "work@example.com" }, { id: "ca_2" }]),
  ]);
  expect(text).toContain("ca_1 (work@example.com), ca_2 (account 2)");
  expect(text).toContain("always pass `account`; never omit it");
  expect(text).toContain(
    "or an earlier choice in this conversation unambiguously identify one of the listed accounts",
  );
  expect(text).toContain(
    "If ANY account lacks an identity label and the choice is still unclear, you MUST ask ONE ask_user question before acting, even for read-only actions",
  );
  expect(text).toContain("Never guess which account is work or personal");
  expect(text).toContain(
    "keep using that account for the rest of this conversation without asking again",
  );
  expect(text).toContain(
    "If no one can answer a question right now and nothing identifies the account, do not act on that app",
  );
  expect(text).toContain("that always needs their attention");
  expect(text).toContain("never ask when the app has a single account");
});

test("unnamed accounts connected on the same day carry their order within that day", () => {
  const text = multiAccountNote([
    match([
      { id: "ca_2", createdAt: "2026-07-28T18:00:00.000Z" },
      { id: "ca_1", createdAt: "2026-07-28T09:00:00.000Z" },
      {
        id: "ca_3",
        label: "work@example.com",
        createdAt: "2026-07-28T12:00:00Z",
      },
      { id: "ca_4", createdAt: "2026-07-29T09:00:00.000Z" },
    ]),
  ]);
  expect(text).toContain(
    "- googledrive: ca_2 (connected on July 28, 2026, the 2nd of 2 that day), ca_1 (connected on July 28, 2026, the 1st of 2 that day), ca_3 (work@example.com), ca_4 (connected on July 29, 2026)",
  );
});
