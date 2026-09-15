import type { ServerResponse } from "node:http";
import { expect, test, vi } from "vitest";
import { processAssistantCatalog } from "../assistant/catalog-source";
import type { EntityDirectory } from "../assistant/entity-directory";
import type { AssistantOperationCtx } from "./assistant-operation-ctx";
import {
  chatAddressedItself,
  refusedProtectedChat,
} from "./assistant-protected-chat";

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

test("rename and delete name the agent whose board is read", () => {
  // The board answers for missions the convention does not spell, and it is
  // found through the operation's own agent parameter. A catalog that stopped
  // declaring one would leave the guard back at reading the id alone — with
  // nothing failing to say so.
  for (const name of ["conversations.rename", "conversations.delete"]) {
    expect(
      operation(name).params.some((param) => param.resolver === "agents"),
    ).toBe(true);
  }
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

/**
 * A BOARD THAT CANNOT BE READ. The guard asks the agent's board whether a
 * mission owns this chat, and that read can fail (a pod's gateway blips, agent
 * data is unavailable). Nothing above catches it, so an escaping rejection
 * would leave the request hanging with the user waiting on an answer that
 * never comes — and the delete it was asked to judge un-refused.
 */
function mockRes() {
  const out: { status?: number; body?: unknown } = {};
  const res = {
    writeHead: (status: number) => {
      out.status = status;
    },
    end: (buf?: Buffer | string) => {
      const text = buf?.toString() ?? "";
      out.body = text ? JSON.parse(text) : undefined;
    },
  } as unknown as ServerResponse;
  return { res, out };
}

function ctxWithBoard(activities: () => Promise<readonly never[]>) {
  return {
    agentId: ".assistant",
    conversationId: "conv-1",
    unserved: new Set<string>(),
    directory: { activities } as unknown as EntityDirectory,
  } as unknown as AssistantOperationCtx;
}

test("a board that cannot be read refuses the delete instead of escaping", async () => {
  const reported = vi.spyOn(console, "error").mockImplementation(() => {});
  const { res, out } = mockRes();
  const refused = await refusedProtectedChat(
    ctxWithBoard(() => Promise.reject(new Error("gateway blip"))),
    operation("conversations.delete"),
    { agentId: "Work/Ada", id: "conv-2" },
    res,
  );
  expect(refused).toBe(true);
  expect(out.status).toBe(502);
  expect(out.body).toMatchObject({ code: "directory_unavailable" });
  // Silent to the user, never silent to us.
  expect(reported).toHaveBeenCalled();
  reported.mockRestore();
});

test("a board that reads answers the call it was asked about", async () => {
  const { res } = mockRes();
  const refused = await refusedProtectedChat(
    ctxWithBoard(() => Promise.resolve([])),
    operation("conversations.delete"),
    { agentId: "Work/Ada", id: "conv-2" },
    res,
  );
  expect(refused).toBe(false);
});
