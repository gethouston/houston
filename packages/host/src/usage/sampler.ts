import { randomUUID } from "node:crypto";
import type { ChannelCtx } from "../ports";

/**
 * Managed-pod active-time sampler.
 *
 * The gateway meters how long this pod is AWAKE from the outside; what it
 * cannot see is how much of that time the agent spent actually executing
 * (turns run inside the runtime subprocess — this host only has the `/busy`
 * probe). So the pod samples its own busy state every few seconds, accrues
 * per-UTC-day totals, and reports them CUMULATIVELY (per boot, per day) to the
 * gateway's pod-usage ingest. Cumulative + GREATEST-upsert server-side makes
 * at-least-once flushing exact: a lost response self-heals on the next flush
 * and a crash loses at most one flush interval.
 *
 * Constructed ONLY on managed cloud pods (the HOUSTON_CREDENTIALS_URL env
 * quadruple); desktop and self-host never build one. Reporting is accounting,
 * never load-bearing: every failure is logged and swallowed — this daemon has
 * no user action to surface to (the beta silent-failure rule's watcher/daemon
 * exception) and must never take a pod down.
 */

interface DayTotals {
  activeMs: number;
  turns: number;
  routineRuns: number;
}

export interface UsageSamplerOptions {
  /** Gateway ingest target — the managed-pod env quadruple. */
  report: { url: string; orgSlug: string; agentSlug: string; podToken: string };
  /** Every (workspace, agent) this host serves (a managed pod hosts one). */
  listAgents(): Promise<ChannelCtx[]>;
  /**
   * Whether a turn is executing in this agent's runtime right now. Must not
   * wake anything (ProxyChannel.busy short-circuits on a non-running runtime).
   */
  turnBusy(ctx: ChannelCtx): Promise<boolean>;
  /** Ids of this agent's routine runs currently in "running" state. */
  runningRoutineRuns(ctx: ChannelCtx): Promise<string[]>;
  sampleMs?: number;
  flushMs?: number;
  /** Test seams. */
  now?: () => number;
  fetchImpl?: typeof fetch;
  log?: (message: string, err?: unknown) => void;
}

const DAY_MS = 86_400_000;
const dayOf = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export class UsageSampler {
  private readonly bootId = randomUUID();
  private readonly days = new Map<string, DayTotals>();
  private readonly prevTurnBusy = new Map<string, boolean>();
  private readonly prevRunIds = new Map<string, Set<string>>();
  private readonly sampleMs: number;
  private readonly flushMs: number;
  private readonly now: () => number;
  private readonly log: (message: string, err?: unknown) => void;
  private lastTickAt = 0;
  private lastFailure: string | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private stopped = false;

  constructor(private readonly opts: UsageSamplerOptions) {
    this.sampleMs = opts.sampleMs ?? 5_000;
    this.flushMs = opts.flushMs ?? 60_000;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m, e) => console.error(m, e ?? ""));
  }

  start(): void {
    this.lastTickAt = this.now();
    this.timers = [
      setInterval(() => void this.tick(), this.sampleMs),
      setInterval(() => void this.flush(), this.flushMs),
    ];
  }

  /** Final sample + flush; used as the pod's SIGTERM drain hook. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    await this.tick();
    await this.flush();
  }

  /** One busy sample. Exposed for tests; production runs it on the interval. */
  async tick(): Promise<void> {
    const now = this.now();
    // Cap the credited stretch so a suspended/starved event loop (or a missed
    // tick) never counts dead time as active — bounded undercount, like the
    // gateway's awake accounting.
    const elapsed = Math.min(
      Math.max(0, now - this.lastTickAt),
      2 * this.sampleMs,
    );
    this.lastTickAt = now;
    let busy = false;
    try {
      for (const ctx of await this.opts.listAgents()) {
        const id = ctx.agent.id;
        const turnBusy = await this.opts.turnBusy(ctx);
        if (turnBusy && !this.prevTurnBusy.get(id)) {
          this.totals(dayOf(now)).turns += 1;
        }
        this.prevTurnBusy.set(id, turnBusy);
        const running = new Set(await this.opts.runningRoutineRuns(ctx));
        const prev = this.prevRunIds.get(id);
        for (const runId of running) {
          if (!prev?.has(runId)) this.totals(dayOf(now)).routineRuns += 1;
        }
        this.prevRunIds.set(id, running);
        busy ||= turnBusy || running.size > 0;
      }
    } catch (err) {
      // A failed sample loses ≤ one sampleMs of attribution; never crash a pod
      // over accounting.
      this.log("[usage-sampler] sample failed (skipping tick):", err);
      return;
    }
    if (busy && elapsed > 0) this.credit(now - elapsed, now);
  }

  /** Report today's (± yesterday's) cumulative totals. Never throws. */
  async flush(): Promise<void> {
    const today = dayOf(this.now());
    const yesterday = dayOf(this.now() - DAY_MS);
    // Days that scrolled out of the reporting window are done — the gateway
    // rejects them anyway; drop them so a long-lived pod stays bounded.
    for (const day of this.days.keys()) {
      if (day !== today && day !== yesterday) this.days.delete(day);
    }
    const entries = [yesterday, today]
      .filter((day, i, all) => all.indexOf(day) === i)
      .map((day) => ({ day, ...this.days.get(day) }))
      .filter((e) => e.activeMs !== undefined) as Array<
      { day: string } & DayTotals
    >;
    if (entries.length === 0) return;
    const { url, orgSlug, agentSlug, podToken } = this.opts.report;
    const target = `${url.replace(/\/+$/, "")}/v1/pod/usage/${encodeURIComponent(orgSlug)}/${encodeURIComponent(agentSlug)}`;
    try {
      const fetchImpl = this.opts.fetchImpl ?? fetch;
      const res = await fetchImpl(target, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${podToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ bootId: this.bootId, days: entries }),
      });
      if (!res.ok) {
        // A 404 is an older gateway that doesn't serve the ingest yet
        // (deploy-order tolerance); anything else is worth a look. Either way
        // keep accumulating — totals are cumulative, the next flush self-heals.
        this.failure(`[usage-sampler] report rejected: ${res.status}`);
        return;
      }
      this.lastFailure = null;
    } catch (err) {
      this.failure(
        `[usage-sampler] report failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private totals(day: string): DayTotals {
    let t = this.days.get(day);
    if (!t) {
      t = { activeMs: 0, turns: 0, routineRuns: 0 };
      this.days.set(day, t);
    }
    return t;
  }

  /** Attribute a busy stretch to UTC days, splitting at midnight. */
  private credit(fromTs: number, toTs: number): void {
    let from = fromTs;
    while (from < toTs) {
      const nextMidnight = Math.floor(from / DAY_MS + 1) * DAY_MS;
      const end = Math.min(toTs, nextMidnight);
      this.totals(dayOf(from)).activeMs += end - from;
      from = end;
    }
  }

  /** Log each distinct failure once, not every 60s forever. */
  private failure(message: string): void {
    if (this.lastFailure === message) return;
    this.lastFailure = message;
    this.log(message);
  }
}
