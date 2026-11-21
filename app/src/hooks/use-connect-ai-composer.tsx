import { type ReactNode, useMemo } from "react";
import { ChatConnectAiEmptyState } from "../components/chat-connect-ai-empty-state.tsx";
import {
  type ConnectAiScan,
  useConnectAiDecision,
} from "./use-connect-ai-gate";

export interface ConnectAiComposer {
  active: boolean;
  node: ReactNode | null;
}

export function useConnectAiComposer(scan: ConnectAiScan): ConnectAiComposer {
  const { active, variant, canConnect, connect } = useConnectAiDecision(scan);
  const node = useMemo<ReactNode | null>(
    () =>
      active ? (
        <ChatConnectAiEmptyState
          variant={variant}
          onConnect={canConnect ? connect : undefined}
        />
      ) : null,
    [active, variant, canConnect, connect],
  );
  return { active, node };
}
