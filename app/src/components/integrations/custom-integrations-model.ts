import type {
  CustomAuthMethod,
  CustomIntegrationView,
} from "@houston/engine-adapter";

export function customKindBadgeKey(
  kind: CustomIntegrationView["kind"],
): "custom.badge.api" | "custom.badge.mcp" {
  return kind === "openapi" ? "custom.badge.api" : "custom.badge.mcp";
}

export function customAuthMethod(
  view: Pick<CustomIntegrationView, "authMethods" | "state">,
): CustomAuthMethod | null {
  if (view.authMethods && view.authMethods.length > 0)
    return view.authMethods[0];
  if (view.state.status === "pending" && view.state.authMethods.length > 0)
    return view.state.authMethods[0];
  return null;
}

export function isPendingCredential(view: CustomIntegrationView): boolean {
  return view.state.status === "pending";
}
