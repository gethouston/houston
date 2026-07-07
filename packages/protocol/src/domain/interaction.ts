// A pending interaction: the one thing a mission is waiting on the user for.
// Recorded when the model calls ask_user / request_connection; carried on the
// terminal `done` wire frame and persisted on the Activity so the board card
// settles to `needs_you` (present) vs `done` (absent) and the UI can render a
// composer-replacing card.

export interface InteractionOption {
  id: string;
  label: string;
}

/**
 * How a custom integration authenticates its outbound HTTP requests. The secret
 * itself never travels on this shape (nor on any PendingInteraction) — only how
 * to attach it: as a request header (optionally prefixed, e.g. `Bearer `) or as
 * a query parameter. The gateway injects the stored key at request time.
 */
export type CustomIntegrationAuth =
  | { type: "header"; header: string; prefix?: string }
  | { type: "query"; param: string };

export type PendingInteraction =
  | { kind: "question"; question: string; options?: InteractionOption[] }
  | { kind: "connect"; toolkit: string; reason?: string }
  // The model proposed connecting a service the catalog can't offer, described
  // by name/base URL/auth scheme. Carries NO secret — the user supplies the API
  // key in the card that renders in place of the chat input.
  | {
      kind: "custom_integration";
      proposal: {
        name: string;
        baseUrl: string;
        auth: CustomIntegrationAuth;
        description: string;
      };
      reason?: string;
    };
