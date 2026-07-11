import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_SCOPE,
  type PersonScope,
  reconcileAgentScope,
} from "../lib/agent-person-scope";

interface AgentPersonScopeValue {
  /** Agent path this scope belongs to. */
  path: string;
  /** The reconciled scope for THIS frame (reset to the default on agent switch). */
  scope: PersonScope;
  setScope: (scope: PersonScope) => void;
}

const AgentPersonScopeContext = createContext<AgentPersonScopeValue | null>(
  null,
);

/**
 * Holds the per-agent PERSON SCOPE and shares it across the agent view so the
 * header trigger ({@link AgentPersonScopeMenu}) and the board filter
 * ({@link useAgentBoardScope}) — which sit in different subtrees — read and
 * write ONE selection. Wraps the whole agent view (tab bar + board), keyed by
 * agent path.
 *
 * The scope is per-agent and resets to {@link DEFAULT_SCOPE} (me) on agent
 * switch. The view is reused across agents, so the reset happens during render
 * via {@link reconcileAgentScope}: `reconciled` is the single source of truth
 * for this frame — persisted to state AND handed to consumers below — so the
 * reset lands before the filtered board commits (no one-frame flash of the
 * previous agent's scope).
 */
export function AgentPersonScopeProvider({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const [scope, setScope] = useState<PersonScope>(DEFAULT_SCOPE);
  const [trackedPath, setTrackedPath] = useState(path);
  const reconciled = reconcileAgentScope({ trackedPath, path, scope });
  if (trackedPath !== path) {
    setTrackedPath(path);
    setScope(reconciled);
  }

  const value = useMemo<AgentPersonScopeValue>(
    () => ({ path, scope: reconciled, setScope }),
    [path, reconciled],
  );
  return (
    <AgentPersonScopeContext.Provider value={value}>
      {children}
    </AgentPersonScopeContext.Provider>
  );
}

/**
 * The active per-agent person scope. Returns the default (me) with a no-op
 * setter when rendered outside a provider, so a board mounted without the agent
 * view header (never in practice) degrades to the unfiltered default rather
 * than throwing.
 */
export function useAgentPersonScope(): AgentPersonScopeValue {
  return (
    useContext(AgentPersonScopeContext) ?? {
      path: "",
      scope: DEFAULT_SCOPE,
      setScope: () => {},
    }
  );
}
