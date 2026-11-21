import type { StepAnswer, StepperState } from "./interaction-card-logic.ts";

export interface FileClaim {
  files: readonly File[];
  answer: string;
}

export type FileClaims = Readonly<Record<string, FileClaim>>;

function isLive(claim: FileClaim, files: readonly File[]): boolean {
  return claim.files.every((f) => files.includes(f));
}

export function stepFiles(
  claims: FileClaims | undefined,
  stepId: string,
  files: readonly File[],
): { files: File[]; exclusive: boolean } {
  const held = new Set<File>();
  for (const [id, claim] of Object.entries(claims ?? {})) {
    if (id === stepId || !isLive(claim, files)) continue;
    for (const f of claim.files) held.add(f);
  }
  return {
    files: files.filter((f) => !held.has(f)),
    exclusive: held.size === 0,
  };
}

export function claimFiles(
  state: StepperState,
  stepId: string,
  files: readonly File[],
  answer: string,
): StepperState {
  return {
    ...state,
    fileClaims: {
      ...state.fileClaims,
      [stepId]: { files: [...files], answer },
    },
  };
}

export function releaseClaim(
  state: StepperState,
  stepId: string,
  committed?: StepAnswer,
): StepperState {
  const claim = state.fileClaims?.[stepId];
  if (!claim) return state;
  if (committed?.optionId === null && committed.answer === claim.answer) {
    return state;
  }
  const { [stepId]: _, ...rest } = state.fileClaims ?? {};
  return { ...state, fileClaims: rest };
}
