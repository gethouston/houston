/**
 * Fixture sub-clients: the SECOND hop of a two-hop request.
 *
 * Stands in for `@houston/runtime-client` — the path literals live here, the
 * values live in the module method that calls in, and the client's own base URL
 * decides the prefix. Nothing imports this outside the extractor tests.
 */

interface Requester {
  request(path: string, init?: RequestInit): Promise<Response>;
  json<T>(path: string, init?: RequestInit): Promise<T>;
}

declare function createRequester(config: { baseUrl: string }): Requester;

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** The only kind the fixture gateway serves; every route keys on this segment. */
const KIND = "widgets";

/** The `(string & {})` widening: the named kinds, any other id still accepted. */
export type ThingKind = "widget" | "gadget" | (string & {});

/** The same widening over a TEMPLATE literal: still a string, not an object. */
export type ThingToken = `thing-${string}` & {};

export interface Thing {
  id: string;
  name: string;
}

/** User-scoped: rooted at the base URL, so its literals carry `/v1` already. */
export class ThingsClient {
  private readonly r: Requester;

  constructor(config: { baseUrl: string }) {
    this.r = createRequester(config);
  }

  async listThings(): Promise<Thing[]> {
    return (await this.r.json<{ items: Thing[] }>(`/v1/${KIND}`)).items;
  }

  countThings(): Promise<{ total: number; kind: ThingKind }> {
    return this.r.json(`/v1/${KIND}/count`);
  }

  renameThing(id: string, name: string): Promise<Thing> {
    return this.r.json(`/v1/${KIND}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name }),
    });
  }

  /** `opts.scope` is additive; omitted, this is the plain `KIND` route. */
  async detachThing(
    kind: string,
    opts?: { scope?: string; force?: boolean },
  ): Promise<void> {
    const scope = opts?.scope ?? KIND;
    await this.r.request(`/v1/${encodeURIComponent(scope)}/detach`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        kind,
        ...(opts?.force ? { force: opts.force } : {}),
      }),
    });
  }

  /** A local `const` shadows the module's `KIND`, exactly as it does at
   *  runtime — the scrap route is the local's collection, not the module's. */
  async scrapThing(id: string): Promise<void> {
    const KIND = "gadgets";
    await this.r.request(`/v1/${KIND}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  /**
   * The scope arrives DESTRUCTURED and its default is applied in the body, so
   * a caller that passes options still overrides which route runs.
   */
  async unpinThing(
    id: string,
    { scope }: { scope?: string } = {},
  ): Promise<void> {
    const where = scope ?? KIND;
    await this.r.request(
      `/v1/${encodeURIComponent(where)}/${encodeURIComponent(id)}/unpin`,
      { method: "POST" },
    );
  }

  stampThing<T extends string>(id: T, token: ThingToken): Promise<Thing> {
    return this.r.json(`/v1/${KIND}/${encodeURIComponent(id)}/stamp`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ token }),
    });
  }

  /** The overload case: the published name is `id`, the body binds `a`. */
  seekThing(id: string): Promise<Thing> {
    return this.r.json(`/v1/${KIND}/seek/${encodeURIComponent(id)}`);
  }

  /** Two requests inside ONE client method: no single route describes it. */
  async auditThing(id: string): Promise<Thing> {
    await this.r.request(`/v1/${KIND}/${encodeURIComponent(id)}/audit`, {
      method: "POST",
    });
    return this.r.json(`/v1/${KIND}/${encodeURIComponent(id)}`);
  }
}

/** Per-agent: the module resolves it rooted at `/agents/<id>`. */
export class AgentThingsClient {
  private readonly r: Requester;

  constructor(config: { baseUrl: string }) {
    this.r = createRequester(config);
  }

  readThing(id: string): Promise<Thing> {
    return this.r.json(`/things/${encodeURIComponent(id)}`);
  }

  inspectThing(id: string): Promise<Thing> {
    return this.r.json(`/gadgets/${encodeURIComponent(id)}`);
  }

  probeThing(id: string): Promise<Thing> {
    return this.r.json(`/probes/${encodeURIComponent(id)}`);
  }
}

/** A client handed back by a factory that is NOT `ctx.clientFor`. */
export declare function strayThingsClient(): AgentThingsClient;
