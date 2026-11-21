import { invokeNative } from "./invoke.ts";

export function osAuthGetItem(key: string): Promise<string | null> {
  return invokeNative<string | null>("auth_get_item", { key });
}

export function osAuthSetItem(key: string, value: string): Promise<void> {
  return invokeNative<void>("auth_set_item", { key, value });
}

export function osAuthRemoveItem(key: string): Promise<void> {
  return invokeNative<void>("auth_remove_item", { key });
}

export function osReadClaudeCredential(handoff: boolean): Promise<string> {
  return invokeNative<string>("read_claude_credential", { handoff });
}

export function osDiscardClaudeHandoffCredential(): Promise<void> {
  return invokeNative<void>("discard_claude_handoff_credential");
}
