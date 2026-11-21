import { DEFAULT_AGENT_ID } from "../synthetic";

export const LAST_AGENT_PREF = "houston.pref.last_agent_id";

export type AgentListState =
  | { readonly kind: "pending" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "known"; readonly ids: readonly string[] };

export abstract class AgentSelection {
  private _agentList: AgentListState = { kind: "pending" };

  protected forgetAgentList(): void {
    this._agentList = { kind: "pending" };
  }

  currentAgentId(): string | null {
    try {
      const id = localStorage.getItem(LAST_AGENT_PREF);
      return id && id !== DEFAULT_AGENT_ID ? id : null;
    } catch {
      return null;
    }
  }

  get agentList(): AgentListState {
    return this._agentList;
  }

  noteAgentList(ids: string[]): void {
    this._agentList = { kind: "known", ids };
  }

  noteAgentAdded(id: string): void {
    const list = this._agentList;
    if (list.kind !== "known" || list.ids.includes(id)) return;
    this._agentList = { kind: "known", ids: [...list.ids, id] };
  }

  noteAgentGone(id: string): void {
    const list = this._agentList;
    if (list.kind === "known" && list.ids.includes(id))
      this._agentList = {
        kind: "known",
        ids: list.ids.filter((x) => x !== id),
      };
    this.dropLastAgentPref((pref) => pref === id);
  }

  noteAgentsUnavailable(): void {
    if (this._agentList.kind === "pending")
      this._agentList = { kind: "unavailable" };
  }

  providerAgentId(): string | null {
    const id = this.currentAgentId();
    const list = this._agentList;
    if (list.kind !== "known") return id;
    if (id && list.ids.includes(id)) return id;
    return list.ids[0] ?? null;
  }

  dropLastAgentPref(isStale: (id: string) => boolean): void {
    try {
      const id = localStorage.getItem(LAST_AGENT_PREF);
      if (id && id !== DEFAULT_AGENT_ID && isStale(id))
        localStorage.removeItem(LAST_AGENT_PREF);
    } catch {}
  }

  requireAgentId(): string {
    const id = this.currentAgentId();
    if (!id) throw new Error("Open an agent first, then connect its account.");
    return id;
  }
}
