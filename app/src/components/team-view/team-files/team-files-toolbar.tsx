import { FilesSearch } from "@houston-ai/agent";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import {
  ChevronDown,
  Download,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export interface TeamFileActions {
  upload?: () => void;
  uploadFolder?: () => void;
  newFolder: () => void;
  /** Desktop: the employee's folder in the OS file manager. */
  reveal?: () => void;
  /** Browser builds: every file as one download. */
  downloadAll?: () => void;
}

/**
 * The whole-tree action the host offers, desktop's file manager first. Icon
 * only on the phone, where the search field needs the width.
 */
function WholeTreeAction({ actions }: { actions: TeamFileActions }) {
  const { t } = useTranslation("agents");
  const action = actions.reveal
    ? {
        label: t("files.openInFileManager"),
        run: actions.reveal,
        Icon: FolderOpen,
      }
    : actions.downloadAll
      ? {
          label: t("files.downloadAll"),
          run: actions.downloadAll,
          Icon: Download,
        }
      : null;
  if (!action) return null;
  return (
    <Button
      variant="secondary"
      aria-label={action.label}
      onClick={action.run}
      className="shrink-0 rounded-full"
    >
      <action.Icon aria-hidden className="size-4" />
      <span className="hidden md:inline">{action.label}</span>
    </Button>
  );
}

function ActionItems({ actions }: { actions: TeamFileActions }) {
  const { t } = useTranslation("agents");
  return (
    <>
      {actions.upload && (
        <DropdownMenuItem onSelect={actions.upload}>
          <Upload aria-hidden /> {t("files.uploadFiles")}
        </DropdownMenuItem>
      )}
      {actions.uploadFolder && (
        <DropdownMenuItem onSelect={actions.uploadFolder}>
          <FolderUp aria-hidden /> {t("files.uploadFolder")}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={actions.newFolder}>
        <FolderPlus aria-hidden /> {t("files.newFolder")}
      </DropdownMenuItem>
    </>
  );
}

export function TeamFilesToolbar({
  actions,
  query,
  onQueryChange,
}: {
  actions: TeamFileActions;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { t } = useTranslation("agents");
  return (
    <div className="flex min-w-0 items-center gap-2">
      <FilesSearch
        value={query}
        onChange={onQueryChange}
        placeholder={t("files.searchPlaceholder")}
        clearLabel={t("files.searchClear")}
      />
      <WholeTreeAction actions={actions} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="shrink-0 rounded-full">
            {t("files.newMenu")} <ChevronDown aria-hidden className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          // New-folder mounts an autofocused inline input; the menu's default
          // close behavior then RESTORES focus to this trigger a beat later,
          // blurring the input, whose blur-cancel kills the creation before
          // the user ever sees it. The menu's actions all move focus onward
          // (an input, a file picker), so the trigger never reclaims it.
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <ActionItems actions={actions} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
