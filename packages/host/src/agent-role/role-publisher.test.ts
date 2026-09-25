import { expect, test, vi } from "vitest";
import type { DocPublisher, ShadowPutResult } from "../docs/doc-publisher";
import type { ShadowFamily } from "../docs/http-shadow";
import type { DocShadowProjector } from "../docs/projector";
import { createRolePublisher } from "./role-publisher";
import { RolePublishDeferredError } from "./role-tracker";

/**
 * A gateway-fronted pod publishes its agent's role to the doc store the
 * gateway lists from, under the same one-agent rule as every other doc.
 */

function shadow(result: ShadowPutResult = "landed") {
  const puts: Array<[ShadowFamily, unknown]> = [];
  const docShadow: DocPublisher = {
    publish: async (family, doc) => {
      puts.push([family, doc]);
      return result;
    },
  };
  return { docShadow, puts };
}

const boundTo = (agentId: string | undefined) =>
  ({ boundAgent: async () => agentId }) as unknown as DocShadowProjector;

test("publishes the bound agent's role as the agent_role document", async () => {
  const { docShadow, puts } = shadow();
  const publish = createRolePublisher(docShadow, boundTo("Houston/Maya"));
  await publish("Houston/Maya", "Store manager");
  await publish("Houston/Maya", undefined);
  expect(puts).toEqual([
    ["agent_role", { role: "Store manager" }],
    ["agent_role", {}],
  ]);
});

test("refuses a role read for any other agent (a rename leftover)", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { docShadow, puts } = shadow();
    const publish = createRolePublisher(docShadow, boundTo("Houston/Maya"));
    await publish("Houston/Old Maya", "Store manager");
    expect(puts).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  } finally {
    warn.mockRestore();
  }
});

test("an unbound route defers the publish so the bind retries it", async () => {
  const { docShadow, puts } = shadow();
  const publish = createRolePublisher(docShadow, boundTo(undefined));
  await expect(publish("Houston/Maya", "Store manager")).rejects.toThrow(
    RolePublishDeferredError,
  );
  expect(puts).toEqual([]);
});

test("a publish the gateway deferred throws so the tracker retries it", async () => {
  const { docShadow } = shadow("deferred");
  const publish = createRolePublisher(docShadow, boundTo("Houston/Maya"));
  await expect(publish("Houston/Maya", "Store manager")).rejects.toThrow(
    RolePublishDeferredError,
  );
});

test("a gateway that cannot hold role documents is not retried", async () => {
  const { docShadow, puts } = shadow("unsupported");
  const publish = createRolePublisher(docShadow, boundTo("Houston/Maya"));
  await expect(
    publish("Houston/Maya", "Store manager"),
  ).resolves.toBeUndefined();
  expect(puts).toHaveLength(1);
});
