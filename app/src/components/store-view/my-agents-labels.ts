import type {
  EditListingDialogLabels,
  OwnedAgentCardLabels,
  ShareAgentDialogLabels,
} from "@houston-ai/store";
import type { TFunction } from "i18next";

/**
 * The owner view's translated label bundles for the shared screen's card,
 * Share dialog, and Edit-listing dialog — kept beside the panel so the panel
 * file stays focused on wiring. Pure `t()` mappings, nothing else.
 */
export function ownedCardLabels(
  t: TFunction<"store">,
): Partial<OwnedAgentCardLabels> {
  return {
    stateDraft: t("me.share.private"),
    stateUnpublished: t("me.share.private"),
    visibilityUnlisted: t("me.share.hidden"),
    manage: t("me.hero.editProfile"),
    edit: t("me.edit.cta"),
    share: t("me.share.cta"),
    delete: t("me.row.delete"),
    deleteTitle: (name: string) => t("me.row.deleteTitle", { name }),
    deleteBody: t("me.row.deleteBody"),
  };
}

export function shareDialogLabels(
  t: TFunction<"store">,
): Partial<ShareAgentDialogLabels> {
  return {
    title: (name: string) => t("me.share.title", { name }),
    publicTitle: t("me.share.public"),
    publicBody: t("me.share.publicBody"),
    publicPending: t("me.share.publicPending"),
    hiddenTitle: t("me.share.hidden"),
    hiddenBody: t("me.share.hiddenBody"),
    privateTitle: t("me.share.private"),
    privateBody: t("me.share.privateBody"),
    copyLink: t("me.share.copyLink"),
    copied: t("me.share.copied"),
  };
}

export function editListingLabels(
  t: TFunction<"store">,
): Partial<EditListingDialogLabels> {
  return {
    title: (name: string) => t("me.edit.title", { name }),
    nameLabel: t("me.edit.name"),
    taglineLabel: t("me.edit.tagline"),
    taglinePlaceholder: t("me.edit.taglinePlaceholder"),
    descriptionLabel: t("me.edit.description"),
    categoryLabel: t("me.edit.category"),
    categoryPlaceholder: t("me.edit.categoryPlaceholder"),
    tagsLabel: t("me.edit.tags"),
    tagsPlaceholder: t("me.edit.tagsPlaceholder"),
    removeTag: (tag: string) => t("me.edit.removeTag", { tag }),
    optional: t("me.edit.optional"),
    contentNote: t("me.edit.contentNote"),
    save: t("me.edit.save"),
    saveFailed: t("me.edit.saveFailed"),
  };
}
