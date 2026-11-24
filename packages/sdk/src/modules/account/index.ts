import type { ModuleContext } from "../../module-context";
import { requireString } from "../payload";
import { createAccountHttp } from "./http";
import {
  AccountCommand,
  type ApiKey,
  type ApiKeyCreated,
  type EditableProfile,
  type EditableProfileUpdate,
  profileUpdate,
} from "./types";

export { AccountHttpError } from "./http";
export type {
  ApiKey,
  ApiKeyCreated,
  EditableProfile,
  EditableProfileCustom,
  EditableProfileUpdate,
} from "./types";
export { AccountCommand, type AccountCommandType } from "./types";

/** The typed facade for the caller's own profile + API keys. */
export interface AccountModule {
  /** The caller's effective display profile. Throws on any non-2xx, 404 included. */
  getMyProfile(): Promise<EditableProfile>;
  /** Set or clear the caller's own name/photo overrides; echoes the effective profile. */
  setMyProfile(update: EditableProfileUpdate): Promise<EditableProfile>;
  /** The caller's active API keys, newest first — display prefixes, no secrets. */
  listApiKeys(): Promise<ApiKey[]>;
  /** Mint a personal API key; the FULL secret is in this one answer and nowhere else. */
  createApiKey(name: string): Promise<ApiKeyCreated>;
  /** Revoke one of the caller's keys by id. */
  revokeApiKey(id: string): Promise<void>;
}

export function createAccountModule(ctx: ModuleContext): AccountModule {
  const http = createAccountHttp(ctx);

  ctx.registerCommand(AccountCommand.GetProfile, () => http.getMyProfile());
  ctx.registerCommand(AccountCommand.SetProfile, (p) =>
    http.setMyProfile(profileUpdate(p, "update")),
  );
  ctx.registerCommand(AccountCommand.ListKeys, () => http.listApiKeys());
  ctx.registerCommand(AccountCommand.CreateKey, (p) =>
    http.createApiKey(requireString(p, "name")),
  );
  ctx.registerCommand(AccountCommand.RevokeKey, (p) =>
    http.revokeApiKey(requireString(p, "id")),
  );

  return {
    getMyProfile: () => http.getMyProfile(),
    setMyProfile: (update) => http.setMyProfile(update),
    listApiKeys: () => http.listApiKeys(),
    createApiKey: (name) => http.createApiKey(name),
    revokeApiKey: (id) => http.revokeApiKey(id),
  };
}
