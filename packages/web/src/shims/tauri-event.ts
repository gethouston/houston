/**
 * Web shim for `@tauri-apps/api/event`.
 *
 * Domain events reach the frontend over the engine WebSocket (see
 * app/src/lib/events.ts -> getEngineWs), NOT Tauri IPC. The only events that
 * ever flowed through Tauri's `listen`/`emit` are local desktop signals
 * (`app-activated`, `houston-engine-ready`, `houston-engine-restarted`,
 * `auth://deep-link`, `notification-clicked`) which have no emitter in a
 * browser tab. So `listen`/`emit` are safe no-ops here; callers already
 * `.catch()` a failing listen (they were written to tolerate non-Tauri envs).
 */

export type UnlistenFn = () => void;

export interface Event<T> {
  event: string;
  id: number;
  payload: T;
}

export async function listen<T = unknown>(
  _event: string,
  _handler: (event: Event<T>) => void,
): Promise<UnlistenFn> {
  return () => {};
}

export async function emit(_event: string, _payload?: unknown): Promise<void> {
  // No local Tauri event bus in a browser tab.
}
