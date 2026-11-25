import type { Transport } from "@earendil-works/pi-ai";

// WHY: pi-ai auto opens a per-session WebSocket for openai-codex; pooled workers never reuse it. ADR-0015
export const POOLED_TURN_TRANSPORT: Transport = "sse";
