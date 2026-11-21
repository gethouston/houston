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
  newFolder?: () => void;
  reveal?: () => void;
  downloadAll?: () => void;
}

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
      {actions.newFolder && (
        <DropdownMenuItem onSelect={actions.newFolder}>
          <FolderPlus aria-hidden /> {t("files.newFolder")}
        </DropdownMenuItem>
      )}
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
      {(actions.upload || actions.uploadFolder || actions.newFolder) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="shrink-0 rounded-full">
              {t("files.newMenu")}{" "}
              <ChevronDown aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <ActionItems actions={actions} />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
