/**
 * A second fixture SDK module, mounted BEFORE `things` so source order argues
 * for the wrong answer everywhere: the hidden twin of a visible operation is
 * read first, and the operations that tie are read first too.
 */

import type { FixtureModuleContext } from "./assistant-module.ts";
import {
  strayThingsClient,
  type Thing,
  type ThingKind,
  ThingsClient,
  type ThingToken,
} from "./assistant-runtime-client.ts";

export function createClaimsModule(ctx: FixtureModuleContext) {
  const client = new ThingsClient({ baseUrl: ctx.config.baseUrl });

  /**
   * Counts the things in the workspace, without publishing what it read.
   * @assistant group:agents
   * @assistant hidden: the no-refetch primitive behind count, which is the one to dispatch; both read the same total.
   */
  const tally = (): Promise<{ total: number; kind: ThingKind }> =>
    client.countThings();

  /**
   * Reads a thing from a sandbox this module did not resolve.
   * @assistant group:agents
   */
  const stray = (id: string): Promise<Thing> =>
    strayThingsClient().readThing(id);

  function seek(id: string): Promise<Thing>;
  function seek(a: string): Promise<Thing> {
    return client.seekThing(a);
  }

  /**
   * Detaches a thing, forwarding whatever the caller passed.
   * @assistant group:agents confirm
   */
  const detachAll = (
    ...args: Parameters<ThingsClient["detachThing"]>
  ): Promise<void> => client.detachThing(...args);

  /**
   * Stamps a thing with a token.
   * @assistant group:agents confirm
   */
  const stamp = <T extends string>(id: T, token: ThingToken): Promise<Thing> =>
    client.stampThing(id, token);

  /**
   * Probes a thing inside an agent's sandbox.
   * @assistant group:agents
   */
  const probeFirst = (agentId: string, id: string): Promise<Thing> =>
    ctx.clientFor(agentId).probeThing(id);

  /**
   * Probes the same thing under a second name.
   * @assistant group:agents
   */
  const probeSecond = (agentId: string, id: string): Promise<Thing> =>
    ctx.clientFor(agentId).probeThing(id);

  /**
   * Lists things.
   * @assistant group:agents
   * @assistant hidden: one of two hidden names on one route, which is the tie the gate refuses.
   */
  const listFirst = (): Promise<Thing[]> => client.listThings();

  /**
   * Lists things under a second name.
   * @assistant group:agents
   * @assistant hidden: the other half of that tie.
   */
  const listSecond = (): Promise<Thing[]> => client.listThings();

  return {
    tally,
    stray,
    /**
     * Seeks a thing.
     * @assistant group:agents
     */
    seek,
    detachAll,
    stamp,
    probeFirst,
    probeSecond,
    listFirst,
    listSecond,
  };
}
