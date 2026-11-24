export interface BrowserLiveViewLabels {
  privacy: string;
  back: string;
  address: string;
  addressRefused: string;
  finish: string;
  cancel: string;
  close: string;
  connecting: string;
  reconnecting: string;
  lost: string;
  retry: string;
  endedDone: string;
  endedCancelled: string;
  endedExpired: string;
  endedNone: string;
  notOwner: string;
  tapToType: string;
  /** For assistive tech on the page itself: how to get back to the controls. */
  leavePage: string;
  /** The page itself, for assistive tech. */
  website: string;
  timeLeft: (minutes: number) => string;
  /** The countdown's last minute, shown in the attention colour. */
  timeLeftLastMinute: string;
  /** Unfolds an instruction clamped on a phone, and folds it back. */
  showMore: string;
  showLess: string;
}

export const DEFAULT_BROWSER_LIVE_VIEW_LABELS: BrowserLiveViewLabels = {
  privacy:
    "What you type goes to the website. This AI Employee keeps the sign-in for later, never your password.",
  back: "Back",
  address: "Web address",
  addressRefused: "Only website addresses can be opened here.",
  finish: "I'm done",
  cancel: "Cancel",
  close: "Close",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  lost: "The connection was lost.",
  retry: "Try again",
  endedDone: "Done. You can close this.",
  endedCancelled: "You closed the browser.",
  endedExpired: "Time ran out. Ask in the chat to try again.",
  endedNone: "This browser is no longer waiting for you.",
  notOwner: "Only the person who asked can use this browser.",
  tapToType: "Tap the page to type",
  leavePage:
    "Tab and Escape go to the website. Press Shift+Escape to get back to the browser controls.",
  website: "Website",
  timeLeft: (minutes) => `${minutes} min left`,
  timeLeftLastMinute: "Less than a minute left",
  showMore: "Show more",
  showLess: "Show less",
};
