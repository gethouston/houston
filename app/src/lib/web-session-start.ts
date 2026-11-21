export interface WebSessionStartDeps {
  track(name: "session_started"): void;
  captureVisitor(): string | null;
}

export function createWebSessionStart(deps: WebSessionStartDeps): () => void {
  let started = false;
  return () => {
    if (started) return;
    started = true;
    deps.captureVisitor();
    deps.track("session_started");
  };
}
