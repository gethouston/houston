import Foundation

/// The `integrations/*` command vocabulary the SDK registers
/// (`packages/sdk/src/modules/integrations/types.ts` `IntegrationsCommand`).
/// Centralized so callers never hand-format one and risk a typo that the bridge
/// would reject at runtime.
enum IntegrationsCommand {
  static let refresh = "integrations/refresh"
  static let connect = "integrations/connect"
  static let pollConnection = "integrations/pollConnection"
  static let disconnect = "integrations/disconnect"
  static let grants = "integrations/grants"
  static let setGrants = "integrations/setGrants"
}
