import { extractIdentity, IDENTITY_PROBES } from "./composio-identity";
import type { IntegrationProvider } from "./provider";
import type { Connection } from "./types";

const FAILURE_TTL_MS = 15 * 60 * 1000;
const MAX_FAILURES = 1000;
// The transport sets no timeout, and every list for this account shares one
// in-flight probe, so a stalled probe must not hold those lists.
const PROBE_DEADLINE_MS = 10_000;

type ProbeOutcome = { label?: string; cacheFailure: boolean };

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
          let timer: ReturnType<typeof setTimeout> | undefined;
          const deadline = new Promise<ProbeOutcome>((resolve) => {
            timer = setTimeout(
              () => resolve({ cacheFailure: false }),
              PROBE_DEADLINE_MS,
            );
          });
          // A refusal or a reply without identity is billed and answers the
          // same on retry, so it waits out FAILURE_TTL_MS. A thrown error
          // (network, 429, 5xx) or the deadline may be gone by the next list.
          const probed = this.execute(
            userId,
            probe.action,
            probe.params ?? {},
            undefined,
            id,
          )
            .then(
              (result): ProbeOutcome => ({
                label: result.successful
                  ? extractIdentity(result.data, probe.fields)
                  : undefined,
                cacheFailure: true,
              }),
            )
            .catch((error: unknown): ProbeOutcome => {
              console.warn(
                `[integrations] composio: identity probe failed for '${id}': ${String(error)}`,
              );
              return { cacheFailure: false };
            });
          pending = Promise.race([probed, deadline]).then((outcome) => {
            clearTimeout(timer);
            // Disconnect can invalidate a probe before its response arrives.
            if (this.inflight.get(id) !== pending) return outcome.label;
            this.inflight.delete(id);
            if (outcome.label) {
              this.labels.set(id, outcome.label);
            } else if (outcome.cacheFailure) {
              if (this.failures.size >= MAX_FAILURES) {
                const oldest = this.failures.keys().next().value;
                if (oldest !== undefined) this.failures.delete(oldest);
              }
              this.failures.set(id, Date.now() + FAILURE_TTL_MS);
            }
            return outcome.label;
          });
          this.inflight.set(id, pending);
        }
        const label = await pending;
        return label ? { ...connection, accountLabel: label } : connection;
      }),
    );
  }
}
