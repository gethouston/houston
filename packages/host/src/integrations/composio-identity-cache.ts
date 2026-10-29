import { extractIdentity, IDENTITY_PROBES } from "./composio-identity";
import type { IntegrationProvider } from "./provider";
import type { Connection } from "./types";

const FAILURE_TTL_MS = 15 * 60 * 1000;
const MAX_FAILURES = 1000;

export class ComposioIdentityCache {
  private readonly labels = new Map<string, string>();
  private readonly failures = new Map<string, number>();
  private readonly inflight = new Map<string, Promise<string | undefined>>();

  constructor(private readonly execute: IntegrationProvider["execute"]) {}

  invalidate(connectionId: string): void {
    this.labels.delete(connectionId);
    this.failures.delete(connectionId);
    this.inflight.delete(connectionId);
  }

  async enrich(
    userId: string,
    connections: Connection[],
  ): Promise<Connection[]> {
    return Promise.all(
      connections.map(async (connection) => {
        if (connection.accountLabel || connection.status !== "active") {
          return connection;
        }
        const probe = IDENTITY_PROBES[connection.toolkit.toLowerCase()];
        const id = connection.connectionId;
        if (!probe || !id) return connection;
        const cached = this.labels.get(id);
        if (cached) return { ...connection, accountLabel: cached };
        const retryAt = this.failures.get(id);
        if (retryAt !== undefined && Date.now() < retryAt) return connection;
        this.failures.delete(id);

        let pending = this.inflight.get(id);
        if (!pending) {
          // Probes are billed, including refusals and replies with no identity.
          pending = this.execute(
            userId,
            probe.action,
            probe.params ?? {},
            undefined,
            id,
          )
            .then((result) =>
              result.successful
                ? extractIdentity(result.data, probe.fields)
                : undefined,
            )
            .catch((error: unknown) => {
              console.warn(
                `[integrations] composio: identity probe failed for '${id}': ${String(error)}`,
              );
              return undefined;
            })
            .then((label) => {
              // Disconnect can invalidate a probe before its response arrives.
              if (this.inflight.get(id) !== pending) return label;
              this.inflight.delete(id);
              if (label) {
                this.labels.set(id, label);
              } else {
                if (this.failures.size >= MAX_FAILURES) {
                  const oldest = this.failures.keys().next().value;
                  if (oldest !== undefined) this.failures.delete(oldest);
                }
                this.failures.set(id, Date.now() + FAILURE_TTL_MS);
              }
              return label;
            });
          this.inflight.set(id, pending);
        }
        const label = await pending;
        return label ? { ...connection, accountLabel: label } : connection;
      }),
    );
  }
}
