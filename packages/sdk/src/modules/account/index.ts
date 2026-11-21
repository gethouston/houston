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

export interface AccountModule {
  getMyProfile(): Promise<EditableProfile>;
  setMyProfile(update: EditableProfileUpdate): Promise<EditableProfile>;
  listApiKeys(): Promise<ApiKey[]>;
  createApiKey(name: string): Promise<ApiKeyCreated>;
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
