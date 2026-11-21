import type { ServerResponse } from "node:http";
import { expect, test, vi } from "vitest";
import { processAssistantCatalog } from "../assistant/catalog-source";
import type { EntityDirectory } from "../assistant/entity-directory";
import type { AssistantOperationCtx } from "./assistant-operation-ctx";
import {
  chatAddressedItself,
  refusedProtectedChat,
} from "./assistant-protected-chat";

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
  for (const name of ["conversations.rename", "conversations.delete"]) {
    expect(
      operation(name).params.some((param) => param.resolver === "agents"),
    ).toBe(true);
  }
});

test("an operation acting INSIDE a chat is not one of them", () => {
  expect(chatAddressedItself(operation("turns.cancel"))).toBeNull();
  expect(chatAddressedItself(operation("turns.history"))).toBeNull();
});

test("an operation naming no chat at all is not one of them", () => {
  expect(chatAddressedItself(operation("conversations.list"))).toBeNull();
  expect(chatAddressedItself(operation("listAgents"))).toBeNull();
});

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
