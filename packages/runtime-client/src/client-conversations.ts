import type {
  ConversationImportRequest,
  ConversationImportResult,
} from "@houston/protocol";
import { EngineCredentialClient } from "./client-auth";
import type { ConversationHistory, ConversationSummary } from "./types";

export abstract class EngineConversationsClient extends EngineCredentialClient {
  listConversations() {
    return this.json<ConversationSummary[]>("/conversations");
  }
  getHistory(id: string, opts: { limit?: number; before?: number } = {}) {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts.before !== undefined) params.set("before", String(opts.before));
    const qs = params.toString();
    return this.json<ConversationHistory>(
      `/conversations/${encodeURIComponent(id)}/messages${qs ? `?${qs}` : ""}`,
    );
  }
  cancel(id: string) {
    return this.json<{ ok: boolean; cancelled: boolean }>(
      `/conversations/${encodeURIComponent(id)}/cancel`,
      { method: "POST" },
    );
  }
  setMode(id: string, mode: "execute" | "plan" | "auto") {
    return this.json<{ ok: boolean; applied: boolean }>(
      `/conversations/${encodeURIComponent(id)}/mode`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      },
    );
  }
  dismissInteraction(id: string) {
    return this.json<{ ok: boolean }>(
      `/conversations/${encodeURIComponent(id)}/dismiss-interaction`,
      { method: "POST" },
    );
  }
  truncateConversation(id: string, turnId: string) {
    return this.json<{ ok: boolean; removed: number }>(
      `/conversations/${encodeURIComponent(id)}/truncate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnId }),
      },
    );
  }
  importMessages(id: string, request: ConversationImportRequest) {
    return this.json<ConversationImportResult>(
      `/conversations/${encodeURIComponent(id)}/import`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
    );
  }
  renameConversation(id: string, title: string) {
    return this.json<{ ok: boolean }>(
      `/conversations/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
  }
  deleteConversation(id: string) {
    return this.json<{ ok: boolean }>(
      `/conversations/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
  }
  summarizeTitle(id: string) {
    return this.json<{ title: string }>(
      `/conversations/${encodeURIComponent(id)}/title`,
      { method: "POST" },
    );
  }
  summarizeText(text: string) {
    return this.json<{ title: string }>("/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }
}
