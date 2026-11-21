import type { CreatorLinkMap } from "../components/social-links";

export interface ProfileEditorForm {
  handle: string;
  displayName: string;
  bio: string;
  links: CreatorLinkMap;
}

export interface ProfileEditorPatch extends ProfileEditorForm {}

export const SAVE_ERROR: Record<string, string> = {
  invalid_handle:
    "That handle is not valid. Use 2 to 30 lowercase letters, numbers, or underscores.",
  handle_reserved: "That handle is reserved. Please choose another.",
  handle_taken: "That handle is already taken.",
  handle_change_too_soon: "You can only change your handle once every 30 days.",
  bio_too_long: "Please shorten your bio to under 500 characters.",
  invalid_link: "One of your links is not a valid https:// URL.",
  display_name_required: "Please enter a display name.",
};

export interface ProfileEditorLabels {
  claimTitle: string;
  claimIntro: string;
  editTitle: string;
  editIntro: string;
  errorTitle: string;
  savedTitle: string;
  savedBody: string;
  nameLabel: string;
  optional: string;
  namePlaceholder: string;
  nameHint: string;
  bioLabel: string;
  bioPlaceholder: string;
  create: string;
  save: string;
  saveFailed: string;
  networkFailed: string;
}

export const PROFILE_EDITOR_LABELS: ProfileEditorLabels = {
  claimTitle: "Claim your handle",
  claimIntro: "Pick a handle to create your public creator page.",
  editTitle: "Edit your profile",
  editIntro: "Update how you appear across the store.",
  errorTitle: "That did not work",
  savedTitle: "Saved",
  savedBody: "Your profile is up to date.",
  nameLabel: "Display name",
  optional: "(optional)",
  namePlaceholder: "Your name or brand",
  nameHint: "Leave it empty to use your @handle.",
  bioLabel: "Bio",
  bioPlaceholder: "Tell people what you build.",
  create: "Create profile",
  save: "Save changes",
  saveFailed: "Could not save your profile.",
  networkFailed: "Network error. Please check your connection and try again.",
};
