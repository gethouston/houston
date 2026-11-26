import { realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import type { FileSnapshot } from "../session/file-changes";
import { deferredWorkspaceFile } from "./turn-deferred-rule";
import {
  deferredUnavailable,
  type FileState,
  untilSettled,
} from "./turn-deferred-wait";
import { captureWorkspaceSnapshot } from "./turn-session-success";

const PRIORITIZE_MAX = 16;

export type DeferredOutcome =
  | { state: "loading" }
  | { state: "landed" }
  | { state: "failed"; error: unknown };

interface RelWait {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function relWait(): RelWait {
  let resolve: () => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mayHoldDeferred(rel: string): boolean {
  if (rel === "") return true;
  const segments = rel.split("/");
  if (segments[0] !== "workspaces") return false;
  return segments.length <= 4 || deferredWorkspaceFile(rel);
}

export type DeferredGate = ReturnType<typeof createDeferredGate>;

export function createDeferredGate(storeRoot: string) {
  const roots = [...new Set([storeRoot, realpathSync(storeRoot)])];
  let known: ReadonlySet<string> | undefined;
  let outcome: DeferredOutcome = { state: "loading" };
  let prioritize: (rels: readonly string[]) => void = () => undefined;
  const settledRels = new Set<string>();
  const settledAbsent = new Set<string>();
  let manifest: ReadonlyMap<string, unknown> | undefined;
  const waits = new Map<string, RelWait>();
  const recorded = new Map<string, FileState | null>();
  const change = relWait();
  let knownChange = relWait();

  const record = (rel: string) => {
    if (recorded.has(rel)) return;
    try {
      const stat = statSync(join(storeRoot, rel), { throwIfNoEntry: false });
      recorded.set(
        rel,
        stat ? { size: stat.size, mtimeMs: stat.mtimeMs } : null,
      );
    } catch (error) {
      recorded.set(rel, null);
      console.warn(
        `[turn] deferred_file_stat_failed rel=${rel}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  };
  const recordAll = () => {
    for (const rel of known ?? [])
      if (!rel.split("/").some((part) => part.startsWith("."))) record(rel);
  };
  const storeRel = (path: string) => {
    for (const root of roots) {
      const rel = relative(root, path);
      if (!rel.startsWith("..") && !isAbsolute(rel))
        return rel.split(sep).join("/");
    }
    return undefined;
  };
  const pendingUnder = (rel: string) =>
    [...(known ?? [])].filter(
      (candidate) =>
        !settledRels.has(candidate) &&
        (rel === "" || candidate === rel || candidate.startsWith(`${rel}/`)),
    );
  const waitFor = (rel: string) => {
    let wait = waits.get(rel);
    if (!wait) {
      wait = relWait();
      waits.set(rel, wait);
    }
    return wait.promise;
  };

  const resolvePaths = async (rels: readonly string[]) => {
    if (!known && outcome.state === "loading") await knownChange.promise;
    if (outcome.state === "landed") return;
    if (!known && outcome.state === "failed")
      throw deferredUnavailable(rels, outcome.error);
    for (const rel of rels) if (settledRels.has(rel)) record(rel);
    const targets = rels.flatMap(pendingUnder);
    if (targets.length === 0) return;
    if (outcome.state === "failed")
      throw deferredUnavailable(targets, outcome.error);
    prioritize(targets.slice(0, PRIORITIZE_MAX));
    try {
      await Promise.all(targets.map(waitFor));
    } catch (error) {
      throw deferredUnavailable(targets, error);
    }
  };

  return {
    hooks: {
      onDeferredListed(rels: readonly string[]) {
        known = new Set(rels);
        knownChange.resolve();
        knownChange = relWait();
      },
      onDeferredSettled(rel: string) {
        settledRels.add(rel);
        if (manifest && !manifest.has(rel)) settledAbsent.add(rel);
        const wait = waits.get(rel);
        if (!wait) return;
        record(rel);
        wait.resolve();
      },
    },
    observe(
      ready: Promise<void>,
      started: {
        prioritize: (rels: readonly string[]) => void;
        manifest: ReadonlyMap<string, unknown>;
      },
    ) {
      prioritize = started.prioritize;
      manifest = started.manifest;
      const settle = (next: DeferredOutcome) => {
        outcome = next;
        recordAll();
        for (const wait of waits.values())
          if (next.state === "failed") wait.reject(next.error);
          else wait.resolve();
        knownChange.resolve();
        change.resolve();
      };
      ready.then(
        () => settle({ state: "landed" }),
        (error: unknown) => settle({ state: "failed", error }),
      );
    },
    waitForPaths(
      paths: readonly string[],
      signal: AbortSignal | undefined,
      deadlineMs: number,
    ): Promise<void> {
      const rels = paths
        .map(storeRel)
        .filter((rel): rel is string => rel !== undefined)
        .filter(mayHoldDeferred);
      if (rels.length === 0 || outcome.state === "landed")
        return Promise.resolve();
      return untilSettled(resolvePaths(rels), signal, deadlineMs, rels);
    },
    async waitForAll(
      signal: AbortSignal | undefined,
      deadlineMs: number,
    ): Promise<DeferredOutcome> {
      if (outcome.state === "loading")
        await untilSettled(change.promise, signal, deadlineMs);
      if (outcome.state === "failed" && !known)
        throw deferredUnavailable(undefined, outcome.error);
      return outcome;
    },
    beforeSnapshot(workspaceDir: string): Promise<FileSnapshot | null> {
      const start = captureWorkspaceSnapshot(workspaceDir);
      return change.promise.then(() => {
        if (!start) return null;
        for (const [rel, state] of recorded) {
          const path = relative(workspaceDir, join(storeRoot, rel));
          if (!state || path.startsWith("..") || isAbsolute(path)) continue;
          const key = path.split(sep).join("/");
          if (!start.has(key)) start.set(key, state);
        }
        return start;
      });
    },
    unsynced(rel: string, owned: ReadonlyMap<string, unknown>): boolean {
      if (outcome.state !== "failed") return false;
      return known
        ? known.has(rel) && !owned.has(rel) && !settledAbsent.has(rel)
        : deferredWorkspaceFile(rel);
    },
  };
}
