import "../../../app/tests/support/dom-env";
import type { AgentDelegation } from "@houston/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { planInvalidation } from "../../../app/src/lib/agent-invalidation-plan";
import { queryKeys } from "../../../app/src/lib/query-keys";

const mock = vi.hoisted(() => ({
  set: vi.fn<() => Promise<AgentDelegation>>(),
  get: vi.fn<() => Promise<AgentDelegation>>(),
  report: vi.fn(),
}));
vi.mock("../../../app/src/lib/delegation-facade", () => ({
  tauriAgentDelegation: { set: mock.set, get: mock.get },
}));
vi.mock("../../../app/src/lib/error-report", () => ({
  reportError: mock.report,
  logAndReportError: mock.report,
}));

import {
  useAgentDelegation,
  useSetAgentDelegation,
} from "../../../app/src/hooks/queries/use-agent-delegation";

const agentId = "Personal/Scout";
const initial: AgentDelegation = {
  mode: "all",
  agents: [],
  acceptsMissions: true,
};
const next: AgentDelegation = {
  mode: "off",
  agents: [],
  acceptsMissions: true,
};

let cleanup: (() => void) | undefined;
afterEach(async () => {
  await act(async () => cleanup?.());
  cleanup = undefined;
  mock.set.mockReset();
  mock.get.mockReset();
  mock.report.mockReset();
});

describe("useSetAgentDelegation", () => {
  it("keeps queued picks through AgentsChanged and refetches after the last write", async () => {
    const client = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    const key = queryKeys.agentDelegation(agentId);
    const starting: AgentDelegation = {
      mode: "picked",
      agents: [],
      acceptsMissions: true,
    };
    client.setQueryData(key, starting);
    const writes: Array<(policy: AgentDelegation) => void> = [];
    mock.set.mockImplementation(
      () =>
        new Promise<AgentDelegation>((resolve) => {
          writes.push(resolve);
        }),
    );
    let server = starting;
    mock.get.mockImplementation(async () => server);
    let mutate: ReturnType<typeof useSetAgentDelegation>["mutate"] | undefined;
    function Harness() {
      useAgentDelegation(agentId, true);
      const mutation = useSetAgentDelegation(agentId);
      useEffect(() => {
        mutate = mutation.mutate;
      }, [mutation.mutate]);
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    cleanup = () => {
      root.unmount();
      container.remove();
      client.clear();
    };
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, { client }, createElement(Harness)),
      );
    });
    const add = (id: string) =>
      mutate?.((current) => ({
        ...current,
        agents: [...current.agents, id],
      }));
    await act(async () => {
      add("Personal/A");
      add("Personal/B");
    });
    const first = { ...starting, agents: ["Personal/A"] };
    await act(async () => {
      server = first;
      writes[0]?.(first);
    });
    expect(mock.set).toHaveBeenCalledTimes(2);
    const plan = planInvalidation(
      { type: "AgentsChanged", data: { workspace_id: "Personal" } },
      { workspaceId: "default" },
    );
    await act(async () => {
      await Promise.all(
        plan.invalidate.map((queryKey) =>
          client.invalidateQueries({ queryKey }),
        ),
      );
    });
    expect(mock.get).toHaveBeenCalled();
    add("Personal/C");
    const final = {
      ...starting,
      agents: ["Personal/A", "Personal/B", "Personal/C"],
    };
    await act(async () => {
      writes[1]?.({ ...starting, agents: ["Personal/A", "Personal/B"] });
    });
    expect(mock.set).toHaveBeenNthCalledWith(3, agentId, final);
    await act(async () => {
      server = final;
      writes[2]?.(final);
    });
    expect(mock.get).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(key)).toEqual(final);
  });

  it("keeps the newest policy when an earlier write resolves first", async () => {
    const client = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    const key = queryKeys.agentDelegation(agentId);
    const starting: AgentDelegation = {
      mode: "picked",
      agents: ["Personal/B", "Personal/C", "Personal/D"],
      acceptsMissions: true,
    };
    client.setQueryData(key, starting);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const resolves: Array<(policy: AgentDelegation) => void> = [];
    mock.set.mockImplementation(
      () =>
        new Promise<AgentDelegation>((resolve) => {
          resolves.push(resolve);
        }),
    );
    let mutate: ReturnType<typeof useSetAgentDelegation>["mutate"] | undefined;
    function Harness() {
      const mutation = useSetAgentDelegation(agentId);
      useEffect(() => {
        mutate = mutation.mutate;
      }, [mutation.mutate]);
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    cleanup = () => {
      root.unmount();
      container.remove();
      client.clear();
    };
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, { client }, createElement(Harness)),
      );
    });
    await act(async () => {
      mutate?.((current) => ({
        ...current,
        agents: current.agents.filter((id) => id !== "Personal/B"),
      }));
      mutate?.((current) => ({
        ...current,
        agents: current.agents.filter((id) => id !== "Personal/C"),
      }));
    });
    const first = { ...starting, agents: ["Personal/C", "Personal/D"] };
    const second = { ...starting, agents: ["Personal/D"] };
    expect(client.getQueryData(key)).toEqual(second);
    expect(mock.set).toHaveBeenCalledTimes(1);
    expect(mock.set).toHaveBeenNthCalledWith(1, agentId, first);
    await act(async () => resolves[0]?.(first));
    expect(client.getQueryData(key)).toEqual(second);
    expect(invalidate).not.toHaveBeenCalled();
    expect(mock.set).toHaveBeenNthCalledWith(2, agentId, second);
    await act(async () => resolves[1]?.(second));
    expect(client.getQueryData(key)).toEqual(second);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it("rolls a failed latest write back to the last confirmed server policy", async () => {
    const client = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    const key = queryKeys.agentDelegation(agentId);
    client.setQueryData(key, initial);
    const writes: Array<{
      resolve: (policy: AgentDelegation) => void;
      reject: (error: Error) => void;
    }> = [];
    mock.set.mockImplementation(
      () =>
        new Promise<AgentDelegation>((resolve, reject) => {
          writes.push({ resolve, reject });
        }),
    );
    let mutate: ReturnType<typeof useSetAgentDelegation>["mutate"] | undefined;
    function Harness() {
      const mutation = useSetAgentDelegation(agentId);
      useEffect(() => {
        mutate = mutation.mutate;
      }, [mutation.mutate]);
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    cleanup = () => {
      root.unmount();
      container.remove();
      client.clear();
    };
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, { client }, createElement(Harness)),
      );
    });
    const accepted = { ...initial, mode: "picked" as const };
    const rejected = { ...accepted, acceptsMissions: false };
    await act(async () => {
      mutate?.(() => accepted);
      mutate?.((current) => ({ ...current, acceptsMissions: false }));
    });
    expect(client.getQueryData(key)).toEqual(rejected);
    await act(async () => writes[0]?.resolve(accepted));
    expect(client.getQueryData(key)).toEqual(rejected);
    expect(mock.set).toHaveBeenNthCalledWith(2, agentId, rejected);
    await act(async () => writes[1]?.reject(new Error("latest write failed")));
    expect(client.getQueryData(key)).toEqual(accepted);
    expect(mock.report).toHaveBeenCalledOnce();
  });

  it("keeps the newer policy when a superseded write fails", async () => {
    const client = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    const key = queryKeys.agentDelegation(agentId);
    client.setQueryData(key, initial);
    const writes: Array<{
      resolve: (policy: AgentDelegation) => void;
      reject: (error: Error) => void;
    }> = [];
    mock.set.mockImplementation(
      () =>
        new Promise<AgentDelegation>((resolve, reject) => {
          writes.push({ resolve, reject });
        }),
    );
    let mutate: ReturnType<typeof useSetAgentDelegation>["mutate"] | undefined;
    function Harness() {
      const mutation = useSetAgentDelegation(agentId);
      useEffect(() => {
        mutate = mutation.mutate;
      }, [mutation.mutate]);
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    cleanup = () => {
      root.unmount();
      container.remove();
      client.clear();
    };
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, { client }, createElement(Harness)),
      );
    });
    const first = { ...initial, mode: "picked" as const };
    const second = { ...first, acceptsMissions: false };
    await act(async () => {
      mutate?.(() => first);
      mutate?.((current) => ({ ...current, acceptsMissions: false }));
    });
    await act(async () => writes[0]?.reject(new Error("old write failed")));
    expect(client.getQueryData(key)).toEqual(second);
    expect(mock.set).toHaveBeenNthCalledWith(2, agentId, second);
    await act(async () => writes[1]?.resolve(second));
    expect(client.getQueryData(key)).toEqual(second);
    expect(mock.report).toHaveBeenCalledOnce();
  });

  it("updates optimistically, then rolls back and reports a failed write", async () => {
    const client = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    const key = queryKeys.agentDelegation(agentId);
    client.setQueryData(key, initial);
    let rejectWrite: ((error: Error) => void) | undefined;
    mock.set.mockImplementation(
      () =>
        new Promise<AgentDelegation>((_resolve, reject) => {
          rejectWrite = reject;
        }),
    );
    let mutate: ReturnType<typeof useSetAgentDelegation>["mutate"] | undefined;
    function Harness() {
      const mutation = useSetAgentDelegation(agentId);
      useEffect(() => {
        mutate = mutation.mutate;
      }, [mutation.mutate]);
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    cleanup = () => {
      root.unmount();
      container.remove();
      client.clear();
    };
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, { client }, createElement(Harness)),
      );
    });
    await act(async () => {
      mutate?.(() => next);
    });
    expect(client.getQueryData(key)).toEqual(next);
    await act(async () => {
      rejectWrite?.(new Error("write failed"));
    });
    expect(client.getQueryData(key)).toEqual(initial);
    expect(mock.report).toHaveBeenCalledOnce();
  });
});
