import type {
  BrowserLiveInput,
  BrowserLiveInputAnswer,
  BrowserLiveInputRequest,
  BrowserLiveWindow,
} from "@houston/wire-types";
import type { Clock } from "../../ports";
import { ackPacer } from "./ack-pace";
import { finishWaiters } from "./finish-waiters";
import {
  backOff,
  clearLane,
  type InputLane,
  inputLane,
  timedPost,
} from "./input-lane";
import { batchSize, enqueue, forRetry } from "./input-queue";
import { type BrowserLiveFailure, classifyLiveFailure } from "./live-failure";
import type { BrowserLiveFinishResult } from "./types";

export interface InputBatcherDeps {
  viewer: string;
  post(request: BrowserLiveInputRequest): Promise<BrowserLiveInputAnswer>;
  clock: Clock;
  isTransport(err: unknown): boolean;
  onAnswer(answer: BrowserLiveInputAnswer): void;
  onEnded(failure: Extract<BrowserLiveFailure, { kind: "ended" }>): void;
  onUnexpected(error: unknown): void;
}

export function createInputBatcher(deps: InputBatcherDeps) {
  const { clock } = deps;
  let queue: BrowserLiveInput[] = [];
  let batch: { seq: number; events: BrowserLiveInput[] } | null = null;
  let nextSeq = 1;
  let received = 0;
  let acked = 0;
  let stopped = false;
  let handoff: string | null = null;
  const finish = finishWaiters();
  const events = inputLane();
  const acks = inputLane();
  const pacer = ackPacer(clock, () => pump());

  const covered = () => Math.max(acked, events.ack ?? 0, acks.ack ?? 0);
  const noteAcked = (seq: number) => {
    acked = Math.max(acked, seq);
    pacer.acked(acked);
  };

  const send = (
    l: InputLane,
    request: BrowserLiveInputRequest,
    onSent: () => void,
    onRefused: () => void,
  ) => {
    l.busy = true;
    l.ack = request.ack?.seq ?? null;
    timedPost(deps.post, clock, request).then(
      (answer) => {
        l.busy = false;
        l.ack = null;
        if (stopped) return;
        l.failures = 0;
        l.reported = false;
        if (request.ack) noteAcked(request.ack.seq);
        onSent();
        deps.onAnswer(answer);
        pump();
      },
      (err: unknown) => {
        l.busy = false;
        l.ack = null;
        if (stopped) return;
        const failure = classifyLiveFailure(err, deps.isTransport);
        if (failure.kind === "ended") {
          finish.settle("answered");
          return deps.onEnded(failure);
        }
        if (failure.kind === "unexpected") {
          if (!l.reported) deps.onUnexpected(err);
          l.reported = true;
          onRefused();
        } else if (l === events && batch) {
          batch.events = forRetry(batch.events);
        }
        backOff(l, clock, pump);
      },
    );
  };

  const pumpEvents = (handoff: string) => {
    if (events.busy || events.timer !== null) return;
    if (!batch && queue.length > 0)
      batch = { seq: nextSeq++, events: queue.splice(0, batchSize(queue)) };
    const finishing = queue.length === 0 ? finish.pending() : null;
    if (!batch && !finishing) return;
    const request: BrowserLiveInputRequest = { handoff };
    if (batch) {
      request.events = batch.events;
      request.batch = { viewer: deps.viewer, seq: batch.seq };
    }
    if (received > covered())
      request.ack = { viewer: deps.viewer, seq: received };
    if (finishing) request.finish = finishing;
    const settled = (result: BrowserLiveFinishResult) => () => {
      if (request.events) batch = null;
      if (request.finish) finish.settle(result);
    };
    send(events, request, settled("answered"), settled("abandoned"));
  };

  const pumpAck = (handoff: string) => {
    if (acks.busy || acks.timer !== null) return;
    if (!pacer.ready(covered())) return;
    const ack = received;
    send(
      acks,
      { handoff, ack: { viewer: deps.viewer, seq: ack } },
      () => {},
      () => noteAcked(ack),
    );
  };

  function pump(): void {
    if (stopped || handoff === null) return;
    pumpEvents(handoff);
    pumpAck(handoff);
  }

  return {
    send(event: BrowserLiveInput): void {
      if (stopped) return;
      enqueue(queue, event);
      pump();
    },
    known(id: string, window?: BrowserLiveWindow): void {
      handoff ??= id;
      pacer.windowed(window);
      pump();
    },
    ack(seq: number, bytes: number): void {
      if (seq <= received) return;
      received = seq;
      pacer.received(seq, bytes);
      pump();
    },
    finish(outcome: "done" | "cancel"): Promise<BrowserLiveFinishResult> {
      if (stopped) return Promise.resolve("abandoned");
      const done = finish.request(outcome);
      pump();
      return done;
    },
    stop(result: BrowserLiveFinishResult): void {
      stopped = true;
      queue = [];
      batch = null;
      clearLane(events, clock);
      clearLane(acks, clock);
      pacer.stop();
      finish.settle(result);
    },
  };
}

export type InputBatcher = ReturnType<typeof createInputBatcher>;
