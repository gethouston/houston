import { expect, test } from "vitest";
import { multiAccountsByToolkit } from "./composio-annotate";

test("multi-account search data carries creation dates alongside optional identities", () => {
  const accounts = multiAccountsByToolkit([
    {
      toolkit: "googledrive",
      connectionId: "ca_1",
      status: "active",
      createdAt: "2026-07-28T10:00:00.000Z",
    },
    {
      toolkit: "googledrive",
      connectionId: "ca_2",
      status: "active",
      accountLabel: "work@example.com",
      createdAt: "2026-08-01T10:00:00.000Z",
    },
    { toolkit: "googledrive", connectionId: "ca_3", status: "active" },
  ]);
  expect(accounts.get("googledrive")).toEqual([
    { id: "ca_1", createdAt: "2026-07-28T10:00:00.000Z" },
    {
      id: "ca_2",
      label: "work@example.com",
      createdAt: "2026-08-01T10:00:00.000Z",
    },
    { id: "ca_3" },
  ]);
});
