import { AgentCard, agentTone } from "@houston-ai/store";
import type { StoreAgentSummary } from "@houston/agentstore-client";
import Link from "next/link";

export { agentTone };

export function HomeAgentCard({ agent }: { agent: StoreAgentSummary }) {
  if (!agent.slug) return null;
  return (
    <AgentCard agent={agent} href={`/a/${agent.slug}`} LinkComponent={Link} />
  );
}
