import { create } from "zustand";
import {
  cancelFlow,
  createRegistry,
} from "../components/integrations/connect-flow-registry.ts";
import type {
  ConnectNotice,
  ConnectStep,
} from "../components/integrations/connect-flow-run.ts";

export const connectFlowRegistry = createRegistry();

export const CONNECT_NOTICE_MS = 6000;

interface ConnectFlowState {
  states: Record<string, ConnectStep>;
  notices: Record<string, ConnectNotice>;
  origins: Record<string, string>;
  setOrigin: (toolkit: string, origin: string) => void;
  setStep: (toolkit: string, step: ConnectStep | null) => void;
  setNotice: (toolkit: string, notice: ConnectNotice | null) => void;
  cancelAllConnectFlows: () => void;
}

const noticeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearNoticeTimer(toolkit: string): void {
  const handle = noticeTimers.get(toolkit);
  if (handle === undefined) return;
  clearTimeout(handle);
  noticeTimers.delete(toolkit);
}

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const { [key]: _dropped, ...rest } = map;
  return rest;
}

export const useConnectFlowStore = create<ConnectFlowState>()((set) => ({
  states: {},
  notices: {},
  origins: {},

  setOrigin: (toolkit, origin) =>
    set((prev) =>
      prev.origins[toolkit] === origin
        ? prev
        : { origins: { ...prev.origins, [toolkit]: origin } },
    ),

  setStep: (toolkit, step) =>
    set((prev) => {
      if (step === null) {
        const states = without(prev.states, toolkit);
        if (states === prev.states) return prev;
        return toolkit in prev.notices
          ? { states }
          : { states, origins: without(prev.origins, toolkit) };
      }
      if (prev.states[toolkit] === step) return prev;
      return { states: { ...prev.states, [toolkit]: step } };
    }),

  setNotice: (toolkit, notice) => {
    clearNoticeTimer(toolkit);
    if (notice === null) {
      set((prev) => ({ notices: without(prev.notices, toolkit) }));
      return;
    }
    set((prev) => ({ notices: { ...prev.notices, [toolkit]: notice } }));
    noticeTimers.set(
      toolkit,
      setTimeout(() => {
        noticeTimers.delete(toolkit);
        set((prev) => ({
          notices: without(prev.notices, toolkit),
          origins: without(prev.origins, toolkit),
        }));
      }, CONNECT_NOTICE_MS),
    );
  },

  cancelAllConnectFlows: () => {
    for (const toolkit of [...connectFlowRegistry.keys()]) {
      cancelFlow(connectFlowRegistry, toolkit);
    }
    for (const handle of noticeTimers.values()) clearTimeout(handle);
    noticeTimers.clear();
    set((prev) =>
      Object.keys(prev.notices).length === 0 &&
      Object.keys(prev.origins).length === 0
        ? prev
        : { notices: {}, origins: {} },
    );
  },
}));

export function cancelAllConnectFlows(): void {
  useConnectFlowStore.getState().cancelAllConnectFlows();
}
