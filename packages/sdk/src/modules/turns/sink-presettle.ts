import { PresettlePoll } from "./presettle-poll";
import { presettleFromHistory } from "./settle-from-history";
import { finishGone } from "./turn-notices";
import type { TurnState } from "./turn-settle";
import type { TurnSinkOptions } from "./turn-sink-options";

export interface SinkPresettleDeps {
  s: TurnState;
  o: TurnSinkOptions;
  canArm(): boolean;
  hasEvidence(): boolean;
  adoptTurnId(turnId: string): void;
  settled(): void;
}

export function sinkPresettlePoll(d: SinkPresettleDeps): PresettlePoll {
  return new PresettlePoll(d.o.presettledPollMs, {
    canArm: d.canArm,
    check: async () => {
      const verdict = await presettleFromHistory(
        d.s,
        d.o.reloadHistory,
        d.s.turnId,
        d.o.historyGuard,
        d.hasEvidence,
        d.adoptTurnId,
      );
      if (verdict === "settled") d.settled();
      return verdict;
    },
    gone: () => {
      finishGone(d.s);
      d.settled();
    },
  });
}
