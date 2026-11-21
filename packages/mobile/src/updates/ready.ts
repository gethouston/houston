export const PROVISIONAL_READY_KEY = "houston.ota.provisional_ready";
export const SHELL_SETTLE_MS = 2000;
export const MOUNT_DEADLINE_MS = 30000;

export interface ReadyPorts {
  root: HTMLElement;
  notifyAppReady(): Promise<unknown>;
  currentBundle(): Promise<{ id: string; status: string }>;
  resetToBuiltin(): Promise<void>;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  report(error: unknown): void;
}

export interface ReadyWatch {
  fail(error: unknown): void;
}

type ShellState = "pending" | "mounted" | "crashed";

function shellState(root: HTMLElement): ShellState {
  if (root.querySelector("[data-houston-boot-crashed]")) return "crashed";
  return root.firstElementChild ? "mounted" : "pending";
}

export function declareReadyWhenShellRenders(ports: ReadyPorts): ReadyWatch {
  const provisional = ports.storage.getItem(PROVISIONAL_READY_KEY);
  let settle: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  const finish = () => {
    done = true;
    observer.disconnect();
    if (settle) clearTimeout(settle);
    clearTimeout(deadline);
  };
  const fail = (reason: string) => {
    if (done) return;
    finish();
    if (provisional !== null)
      void rollBackProvisional(ports, provisional, reason);
  };
  const evaluate = () => {
    if (done) return;
    const state = shellState(ports.root);
    if (state === "crashed") return fail("crashed");
    if (state === "pending") return;
    settle ??= setTimeout(() => {
      if (shellState(ports.root) === "crashed") return fail("crashed");
      finish();
      ports.storage.removeItem(PROVISIONAL_READY_KEY);
      void ports.notifyAppReady().catch(ports.report);
    }, SHELL_SETTLE_MS);
  };
  const observer = new MutationObserver(evaluate);
  observer.observe(ports.root, { childList: true, subtree: true });
  const deadline = setTimeout(
    () => fail("never mounted the app"),
    MOUNT_DEADLINE_MS,
  );
  evaluate();
  return {
    fail: (error) => {
      fail(
        `failed to boot (${error instanceof Error ? error.message : String(error)})`,
      );
    },
  };
}

async function rollBackProvisional(
  ports: ReadyPorts,
  bundleId: string,
  reason: string,
): Promise<void> {
  try {
    ports.storage.removeItem(PROVISIONAL_READY_KEY);
    if ((await ports.currentBundle()).id !== bundleId) return;
    ports.report(
      new Error(
        `OTA bundle ${bundleId} ${reason} on its first online launch; resetting to builtin`,
      ),
    );
    await ports.resetToBuiltin();
  } catch (error) {
    ports.report(error);
  }
}

export async function declareProvisionalReady(
  ports: ReadyPorts,
): Promise<void> {
  const bundle = await ports.currentBundle();
  const confirmed =
    bundle.status === "success" &&
    ports.storage.getItem(PROVISIONAL_READY_KEY) !== bundle.id;
  if (bundle.id !== "builtin" && !confirmed)
    ports.storage.setItem(PROVISIONAL_READY_KEY, bundle.id);
  void ports.notifyAppReady().catch(ports.report);
}
