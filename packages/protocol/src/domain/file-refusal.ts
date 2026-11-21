export type FileOpCode = "name_taken" | "read_only";

export type AgentNameRefusalCode = "name_taken" | "name_reserved";

export const NAME_TAKEN: FileOpCode & AgentNameRefusalCode = "name_taken";

export const NAME_RESERVED: AgentNameRefusalCode = "name_reserved";

export const READ_ONLY: FileOpCode = "read_only";
