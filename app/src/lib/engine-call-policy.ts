export interface EngineCallSurface {
  toast: boolean;
  capture: boolean;
}

export interface EngineCallSurfaceOptions {
  toast?: boolean;
  capture?: boolean;
}

export function engineCallSurface(
  errorName: string | undefined,
  options?: EngineCallSurfaceOptions,
): EngineCallSurface {
  if (errorName === "AbortError") {
    return { toast: false, capture: false };
  }
  return {
    toast: options?.toast !== false,
    capture: options?.capture !== false,
  };
}
