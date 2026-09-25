import type { UISliceCreator } from "./state.ts";
import type { ToastItem } from "./types.ts";

export interface ToastFields {
  toasts: ToastItem[];
}

export interface ToastActions {
  addToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
}

export const toastInitialState = {
  toasts: [],
} satisfies ToastFields;

let toastCounter = 0;
// Live dismiss timers by toast id, so a coalesced repeat can RESTART its
// toast's countdown (see addToast) and a manual dismiss cancels it.
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Cancel every live dismiss timer (the store's `reset`). */
export function clearToastTimers(): void {
  for (const timer of toastTimers.values()) clearTimeout(timer);
  toastTimers.clear();
}

export const createToastActions: UISliceCreator<ToastActions> = (set) => ({
  addToast: (toast) =>
    set((s) => {
      const timeout = toast.action ? 10000 : 5000;
      const expireAfter = (id: string) => {
        const prevTimer = toastTimers.get(id);
        if (prevTimer) clearTimeout(prevTimer);
        toastTimers.set(
          id,
          setTimeout(() => {
            toastTimers.delete(id);
            set((prev) => ({
              toasts: prev.toasts.filter((t) => t.id !== id),
            }));
          }, timeout),
        );
      };

      // Repeats COALESCE instead of stacking (a repeatedly failing
      // connect used to wall the screen with identical error boxes): the
      // existing toast's counter bumps and its dismiss countdown restarts,
      // so every firing still gives visible feedback AND the toast's
      // action ("Report bug") stays alive — the two failure modes the old
      // "never dedupe errors" rule protected against.
      const existing = s.toasts.find(
        (t) =>
          t.title === toast.title &&
          t.description === toast.description &&
          (t.variant ?? "info") === (toast.variant ?? "info"),
      );
      if (existing) {
        expireAfter(existing.id);
        return {
          toasts: s.toasts.map((t) =>
            t.id === existing.id ? { ...t, count: (t.count ?? 1) + 1 } : t,
          ),
        };
      }

      const id = `toast-${++toastCounter}`;
      expireAfter(id);
      return { toasts: [...s.toasts, { ...toast, id }] };
    }),

  dismissToast: (id) =>
    set((s) => {
      const timer = toastTimers.get(id);
      if (timer) clearTimeout(timer);
      toastTimers.delete(id);
      return { toasts: s.toasts.filter((t) => t.id !== id) };
    }),
});
