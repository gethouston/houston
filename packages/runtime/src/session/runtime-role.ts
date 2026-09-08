import { config } from "../config";

/**
 * Whether THIS runtime is the user's personal assistant — the coordinator that
 * operates Houston and hands work to the user's agents.
 *
 * It is the ROLE the host gave this process (`config.assistantRole`), the same
 * gate the memory + rules prompt sections use. A managed assistant pod runs
 * under `/workspace` with an ordinarily-named agent, so nothing about this
 * process's own directory can tell the coordinator apart from an agent. It
 * clamps the tool surface on BOTH backends and makes every mission tool name
 * the agent whose board it acts on.
 */
export const personalAssistant = config.assistantRole === "coordinator";
