import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { DEFAULT_SCOPE, type PersonScope } from "../lib/agent-person-scope";

interface AgentPersonScopeValue {
  /** Agent path this scope belongs to. */
  path: string;
  /** The scope for this keyed agent view. */
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
 * write ONE selection. The whole agent view is keyed by agent identity, so a
 * fresh provider starts at {@link DEFAULT_SCOPE} for every agent.
 */
export function AgentPersonScopeProvider({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const [scope, setScope] = useState<PersonScope>(DEFAULT_SCOPE);

  const value = useMemo<AgentPersonScopeValue>(
    () => ({ path, scope, setScope }),
    [path, scope],
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
