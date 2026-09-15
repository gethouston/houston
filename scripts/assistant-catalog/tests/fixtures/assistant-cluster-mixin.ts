import { type ControlPlaneConfig, cpFetch } from "./assistant-transport";

interface MixinBase {
  cfg: ControlPlaneConfig;
}

// Mirrors `engine-adapter/client/mixin.ts`: TS accepts only `any[]` as a mixin
// base constructor's rest parameter (TS2545).
// biome-ignore lint/suspicious/noExplicitAny: mixin constructors are variadic by construction.
type MixinCtor = new (...args: any[]) => MixinBase;

interface AgentFile {
  path: string;
}

/** A cluster mixin's class factory: never an operation itself, only a producer
 *  of them. Its private transport wrappers are what the methods reach the wire
 *  through, so each method's route is a wrapper's template with the method's own
 *  sub-path spliced in. Reads need the response and writes do not, so there is
 *  one wrapper per shape. */
export function ThingsMixin<TBase extends MixinCtor>(Base: TBase) {
  class Things extends Base {
    private cpThingsFetch(
      agentId: string,
      path: string,
      init?: RequestInit,
    ): Promise<Response> {
      return cpFetch(
        this.cfg,
        `/agents/${encodeURIComponent(agentId)}/${path}`,
        init,
      );
    }

    private async cpThingsWrite(
      agentId: string,
      path: string,
      init?: RequestInit,
    ): Promise<void> {
      await cpFetch(
        this.cfg,
        `/agents/${encodeURIComponent(agentId)}/${path}`,
        init,
      );
    }

    async listAgentFiles(agentId: string): Promise<AgentFile[]> {
      const res = await this.cpThingsFetch(agentId, "files");
      return ((await res.json()) as { items: AgentFile[] }).items;
    }

    async readAgentFileEntry(
      agentId: string,
      relPath: string,
    ): Promise<string> {
      const res = await this.cpThingsFetch(
        agentId,
        `files/read?path=${encodeURIComponent(relPath)}`,
      );
      return ((await res.json()) as { content: string }).content;
    }

    deleteAgentFileEntry(agentId: string, relPath: string): Promise<void> {
      return this.cpThingsWrite(
        agentId,
        `files?path=${encodeURIComponent(relPath)}`,
        { method: "DELETE" },
      );
    }
  }
  return Things;
}
