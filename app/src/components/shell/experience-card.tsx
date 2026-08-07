// Re-export shim: the AgentCard that used to live here died with the in-dialog
// agent library (PRODUCT-1171), but the avatar helpers are still imported
// under this path across the shell.
export {
  AgentAvatar,
  getAgentIcon,
  getAgentIconColor,
  getHoustonLogo,
  HoustonLogo,
  isLightColor,
} from "./agent-avatar";
