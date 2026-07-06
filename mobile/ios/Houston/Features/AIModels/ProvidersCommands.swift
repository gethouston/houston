import Foundation

/// The `providers/*` command vocabulary (mirrors `ProvidersCommand` in
/// `packages/sdk/src/modules/providers/types.ts`). Payload structs live in
/// `Core/Bridge/Models/ProvidersVM.swift`. All are per-agent (landmine 1).
enum ProvidersCommand {
  static let refresh = "providers/refresh"
  static let refreshStatus = "providers/refreshStatus"
  static let login = "providers/login"
  static let cancelLogin = "providers/cancelLogin"
  static let completeLogin = "providers/completeLogin"
  static let setApiKey = "providers/setApiKey"
  static let logout = "providers/logout"
  static let setModel = "providers/setModel"
}
