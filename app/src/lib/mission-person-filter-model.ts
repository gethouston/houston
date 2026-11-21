export type PersonFilterMode = "hidden" | "teaser" | "filter";

export interface PersonFilterInputs {
  hasSession: boolean;
  spaces: boolean;
  multiplayer: boolean;
  teamSpace: boolean;
}

export function personFilterMode(opts: PersonFilterInputs): PersonFilterMode {
  if (!opts.hasSession) return "hidden";
  if (opts.spaces) return opts.teamSpace ? "filter" : "teaser";
  return opts.multiplayer ? "filter" : "hidden";
}
