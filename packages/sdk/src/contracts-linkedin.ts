/**
 * The linkedin contract: posting a picture to the person's own LinkedIn feed.
 *
 * Re-exported wholesale by the package barrel; import from `@houston/sdk`.
 * The surface rules ride their own subpaths (`@houston/sdk/linkedin/policy`,
 * `@houston/sdk/linkedin/connect-flow`) and are re-exported here too.
 */
// ===== LinkedIn module contract ========================================
export {
  checkLinkedInText,
  isPostableLinkedInText,
  LinkedInCommand,
  type LinkedInCommandType,
  type LinkedInCompletion,
  type LinkedInConnectAnswer,
  type LinkedInConnection,
  type LinkedInConnectReturn,
  LinkedInHttpError,
  type LinkedInModule,
  type LinkedInPostInput,
  type LinkedInPostResult,
  type LinkedInRefusalCode,
  type LinkedInTextCheck,
} from "./modules/linkedin";
export {
  type LinkedInConnectPorts,
  type LinkedInConnectStarted,
  type LinkedInConnectTab,
  LinkedInLoopbackRefusedError,
  type LinkedInReturnListener,
  startLinkedInConnect,
} from "./modules/linkedin/connect-flow";
export {
  isExpectedLinkedInRefusal,
  isLinkedInUnavailableError,
  LINKEDIN_CONNECT_POLL_MS,
  LINKEDIN_CONNECT_WATCH_MS,
  LINKEDIN_FEED_URL,
  type LinkedInConnectWatch,
  type LinkedInRefusalAction,
  linkedInConnectPollMs,
  linkedInPostLink,
  linkedInRefusalAction,
  linkedInRetryMinutes,
  startLinkedInConnectWatch,
} from "./modules/linkedin/policy";
