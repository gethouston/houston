import { expect, test } from "vitest";
import { processAssistantCatalog } from "../assistant/catalog-source";
import { chatAddressedItself } from "./assistant-operation-guards";

/**
 * The protected-chat guard against the REAL catalog.
 *
 * The guard reads a declaration rather than a list of operation names: a
 * parameter that says a chat lists its values (`source: "conversations.list"`)
 * and sits at the END of the route's path is an operation acting on the chat
 * itself. These pin that reading against the generated catalog, because the
 * failure it guards against is silent — a regenerated catalog that spells
 * either half differently leaves the guard matching nothing at all, and the
 * assistant free to delete the chat it is speaking in.
 */

const catalog = processAssistantCatalog();
if (!catalog) throw new Error("missing embedded catalog");

const operation = (name: string) => {
  const found = catalog.operations.find((op) => op.name === name);
  if (!found) throw new Error(`the catalog no longer has "${name}"`);
  return found;
};

test("rename and delete address the chat itself", () => {
  expect(chatAddressedItself(operation("conversations.rename"))).toBe("id");
  expect(chatAddressedItself(operation("conversations.delete"))).toBe("id");
});

test("an operation acting INSIDE a chat is not one of them", () => {
  // Stopping a mission's turn and reading what was said in it both name a chat
  // and must both keep working.
  expect(chatAddressedItself(operation("turns.cancel"))).toBeNull();
  expect(chatAddressedItself(operation("turns.history"))).toBeNull();
});

test("an operation naming no chat at all is not one of them", () => {
  expect(chatAddressedItself(operation("conversations.list"))).toBeNull();
  expect(chatAddressedItself(operation("listAgents"))).toBeNull();
});
