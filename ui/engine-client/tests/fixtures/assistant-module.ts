/**
 * A fixture SDK module: a factory closure whose methods reach the host through
 * a sub-client. Nothing here is exported under an operation's own name — the
 * names come from the facade that mounts the factory.
 */

import {
  type AgentThingsClient,
  type Thing,
  ThingsClient,
} from "./assistant-runtime-client.ts";

export interface FixtureModuleContext {
  config: { baseUrl: string };
  clientFor(agentId: string): AgentThingsClient;
}

export function createThingsWrites(client: ThingsClient) {
  return {
    writes: {
      /**
       * Detaches a thing, with the scope the caller picks.
       * @assistant group:agents confirm
       * @assistant unroutable: the caller may name the scope the route is keyed on, so which route it is is not decided until the call runs.
       */
      detach: (kind: string, opts?: { scope?: string }): Promise<void> =>
        client.detachThing(kind, opts),
    },
  };
}

export function createThingsModule(ctx: FixtureModuleContext) {
  const client = new ThingsClient({ baseUrl: ctx.config.baseUrl });

  /**
   * Renames a thing.
   * @assistant group:agents confirm
   */
  const rename = (id: string, name: string): Promise<Thing> =>
    client.renameThing(id, name);

  /**
   * Inspects one thing inside an agent's sandbox.
   * @assistant group:agents
   */
  const inspect = (agentId: string, id: string): Promise<Thing> =>
    ctx.clientFor(agentId).inspectThing(id);

  // Reaches the route the control plane already publishes as `getThing`, and
  // carries NO `@assistant` block: the dedupe drops it from the catalog, and
  // the coverage gate must judge it anyway.
  const read = (agentId: string, id: string): Promise<Thing> =>
    ctx.clientFor(agentId).readThing(id);

  /**
   * Detaches a thing.
   * @assistant group:agents confirm
   */
  const detach = (kind: string): Promise<void> => client.detachThing(kind);

  /**
   * Reads a thing from whichever sandbox the caller left implied.
   * @assistant group:agents
   * @assistant unroutable: debt: the agent falls back to the single-runtime profile, so which sandbox is read is not decided until the call runs.
   */
  const readLoose = (id: string, agentId?: string): Promise<Thing> =>
    ctx.clientFor(agentId ?? "").readThing(id);

  /**
   * Audits a thing.
   * @assistant group:agents confirm
   * @assistant unroutable: the audit posts and then re-reads the thing, which is two requests, not a route.
   */
  const audit = (id: string): Promise<Thing> => client.auditThing(id);

  /**
   * Scraps a thing, on the collection the client method's own `const` names.
   * @assistant group:agents confirm
   */
  const scrap = (id: string): Promise<void> => client.scrapThing(id);

  function pin(id: string): Promise<void>;
  function pin(scope: string, id: string): Promise<void>;
  function pin(a: string, b?: string): Promise<void> {
    const id = b === undefined ? a : b;
    return client.detachThing(id);
  }

  /**
   * Unpins a thing, in the scope the caller picks.
   * @assistant group:agents confirm
   * @assistant unroutable: the caller may name the scope the route is keyed on, so which route it is is not decided until the call runs.
   */
  const unpin = (id: string, opts?: { scope?: string }): Promise<void> =>
    client.unpinThing(id, opts);

  /**
   * Reads the notes on one thing inside an agent's sandbox.
   * @assistant group:agents
   */
  const notes = (agentId: string, id: string): Promise<Thing[]> =>
    ctx.clientFor(agentId).listNotes(id);

  /**
   * Counts the things in the workspace.
   * @assistant group:agents
   */
  const count = async (): Promise<void> => {
    await client.countThings();
  };

  return {
    rename,
    unpin,
    count,
    notes,
    inspect,
    read,
    detach,
    readLoose,
    audit,
    scrap,
    /**
     * Pins a thing, in the workspace or inside one scope.
     * @assistant group:agents confirm
     * @assistant unroutable: which argument names the thing is decided from how many the caller passed, so the request is not decided until the call runs.
     */
    pin,
    ...createThingsWrites(client),
  };
}

/** Handed someone else's client: a helper of its caller, not an operation. */
export function readThingWith(
  client: AgentThingsClient,
  id: string,
): Promise<Thing> {
  return client.readThing(id);
}
