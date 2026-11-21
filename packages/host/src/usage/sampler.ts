import { randomUUID } from "node:crypto";
import type { ChannelCtx } from "../ports";

interface DayTotals {
  activeMs: number;
  turns: number;
  routineRuns: number;
}

export interface UsageSamplerOptions {
  report: { url: string; orgSlug: string; agentSlug: string; podToken: string };
  listAgents(): Promise<ChannelCtx[]>;
  turnBusy(ctx: ChannelCtx): Promise<boolean>;
  runningRoutineRuns(ctx: ChannelCtx): Promise<string[]>;
  sampleMs?: number;
  flushMs?: number;
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
  private lastBusy = false;
  private lastEdgeFlushAt = 0;
  private edgePending = false;
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

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    await this.tick();
    await this.flush();
  }

  async tick(): Promise<void> {
    const now = this.now();
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
      this.log("[usage-sampler] sample failed (skipping tick):", err);
      return;
    }
    if (busy && elapsed > 0) this.credit(now - elapsed, now);
    if (busy !== this.lastBusy) {
      this.lastBusy = busy;
      this.edgePending = true;
    }
    if (this.edgePending && now - this.lastEdgeFlushAt >= this.sampleMs) {
      this.lastEdgeFlushAt = now;
      this.edgePending = false;
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    const today = dayOf(this.now());
    const yesterday = dayOf(this.now() - DAY_MS);
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
        body: JSON.stringify({
          bootId: this.bootId,
          busy: this.lastBusy,
          days: entries,
        }),
      });
      if (!res.ok) {
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

  private credit(fromTs: number, toTs: number): void {
    let from = fromTs;
    while (from < toTs) {
      const nextMidnight = Math.floor(from / DAY_MS + 1) * DAY_MS;
      const end = Math.min(toTs, nextMidnight);
      this.totals(dayOf(from)).activeMs += end - from;
      from = end;
    }
  }

  private failure(message: string): void {
    if (this.lastFailure === message) return;
    this.lastFailure = message;
    this.log(message);
  }
}
