"use client";

import {
  Button,
  ButtonGroup,
  ButtonGroupText,
  cn,
  ErrorBoundary,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@houston-ai/core";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { UIMessage } from "ai";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type {
  AnchorHTMLAttributes,
  ComponentProps,
  HTMLAttributes,
  ReactElement,
  ReactNode,
} from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";
import { Autolink } from "../autolink";
import { FileChip } from "../file-chip";
import { FILE_PATH_ATTR, fileLinkRehypePlugin } from "../file-link-rehype";
import { fileNameOf, labelExtensionSuffix } from "../file-path";
import { MarkdownCodeBlock } from "../markdown-code-block";
import {
  autolinkDisplay,
  classifyMarkdownLink,
  markdownLinkText,
} from "../markdown-link";
import { MentionMarkdownSpan } from "../mention-chip.tsx";
import type { MentionRehypeOptions } from "../mention-rehype.ts";
import { mentionRehypePlugin } from "../mention-rehype.ts";
import type { MentionTarget } from "../mention-spans.ts";
import { sameMentionTargets } from "../mention-spans.ts";

const MessageAvatarContext = createContext<React.ReactNode | undefined>(
  undefined,
);

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
  /** Optional badge avatar shown on the message bubble (e.g., channel logo). */
  avatar?: React.ReactNode;
  /**
   * A user turn written by SOMEONE ELSE. Alignment stops following
   * the role and follows the WRITER: the viewer's own turns keep the
   * right-aligned near-ink bubble (`is-user`), a teammate's mirrors to the left
   * as a recessed, hairlined bubble (`is-peer`) with room for their face.
   */
  peer?: boolean;
};

function messageVariantClass(
  from: UIMessage["role"],
  peer: boolean | undefined,
): string {
  if (from !== "user")
    return peer ? "is-peer is-agent mr-auto max-w-[85%]" : "is-assistant";
  if (peer) return "is-peer mr-auto max-w-[70%]";
  return "is-user ml-auto max-w-[70%] justify-end";
}

export const Message = ({
  className,
  from,
  avatar,
  peer,
  children,
  ...props
}: MessageProps) => (
  <MessageAvatarContext.Provider value={avatar}>
    <div
      className={cn(
        "group flex w-full flex-col gap-2",
        messageVariantClass(from, peer),
        className,
      )}
      {...props}
    >
      {children}
    </div>
  </MessageAvatarContext.Provider>
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => {
  const avatar = useContext(MessageAvatarContext);
  return (
    <div
      className={cn(
        "relative",
        avatar && "group-[.is-user]:mr-4 group-[.is-peer]:ml-4",
      )}
    >
      <div
        className={cn(
          "flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-base leading-6",
          "group-[.is-user]:ml-auto group-[.is-user]:rounded-[22px] group-[.is-user]:bg-bubble group-[.is-user]:px-4 group-[.is-user]:py-2.5 group-[.is-user]:font-medium group-[.is-user]:text-bubble-text",
          "group-[.is-peer]:mr-auto group-[.is-peer]:rounded-xl group-[.is-peer]:rounded-tl-sm group-[.is-peer]:border group-[.is-peer]:border-line group-[.is-peer]:bg-chip group-[.is-peer]:px-3 group-[.is-peer]:py-2 group-[.is-peer]:text-ink",
          "group-[.is-assistant]:text-prose-text",
          className,
        )}
        {...props}
      >
        {children}
      </div>
      {avatar && (
        <div className="absolute -bottom-1 -right-3.5 group-[.is-assistant]:-left-3.5 group-[.is-assistant]:right-auto group-[.is-peer]:-left-3.5 group-[.is-peer]:right-auto">
          {avatar}
        </div>
      )}
    </div>
  );
};

export type MessageActionsProps = ComponentProps<"div">;

export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

interface MessageBranchContextType {
  currentBranch: number;
  totalBranches: number;
  goToPrevious: () => void;
  goToNext: () => void;
  branches: ReactElement[];
  setBranches: (branches: ReactElement[]) => void;
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(
  null,
);

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext);

  if (!context) {
    throw new Error(
      "MessageBranch components must be used within MessageBranch",
    );
  }

  return context;
};

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number;
  onBranchChange?: (branchIndex: number) => void;
};

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch);
  const [branches, setBranches] = useState<ReactElement[]>([]);

  const handleBranchChange = useCallback(
    (newBranch: number) => {
      setCurrentBranch(newBranch);
      onBranchChange?.(newBranch);
    },
    [onBranchChange],
  );

  const goToPrevious = useCallback(() => {
    const newBranch =
      currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const goToNext = useCallback(() => {
    const newBranch =
      currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const contextValue = useMemo<MessageBranchContextType>(
    () => ({
      branches,
      currentBranch,
      goToNext,
      goToPrevious,
      setBranches,
      totalBranches: branches.length,
    }),
    [branches, currentBranch, goToNext, goToPrevious],
  );

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn("grid w-full gap-2 [&>div]:pb-0", className)}
        {...props}
      />
    </MessageBranchContext.Provider>
  );
};

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageBranchContent = ({
  children,
  ...props
}: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch();
  const childrenArray = useMemo(
    () => (Array.isArray(children) ? children : [children]),
    [children],
  );

  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray);
    }
  }, [childrenArray, branches, setBranches]);

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden",
      )}
      key={branch.key}
      {...props}
    >
      {branch}
    </div>
  ));
};

export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup>;

export const MessageBranchSelector = ({
  className,
  ...props
}: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch();

  if (totalBranches <= 1) {
    return null;
  }

  return (
    <ButtonGroup
      className={cn(
        "[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md",
        className,
      )}
      orientation="horizontal"
      {...props}
    />
  );
};

export type MessageBranchPreviousProps = ComponentProps<typeof Button>;

export const MessageBranchPrevious = ({
  children,
  ...props
}: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  );
};

export type MessageBranchNextProps = ComponentProps<typeof Button>;

export const MessageBranchNext = ({
  children,
  ...props
}: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  );
};

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>;

export const MessageBranchPage = ({
  className,
  ...props
}: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch();

  return (
    <ButtonGroupText
      className={cn(
        "border-none bg-transparent text-ink-muted shadow-none",
        className,
      )}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  );
};

export type RenderLinkProps = {
  href: string;
  children: ReactNode;
  onOpen: () => void;
};
export type RenderLinkFn = (props: RenderLinkProps) => ReactNode | undefined;

export type MessageResponseProps = ComponentProps<typeof Streamdown> & {
  onOpenLink?: (url: string) => void;
  /**
   * Optional custom renderer for markdown links. When provided, it
   * replaces the default button for every `<a>` tag rendered by
   * Streamdown. The default button behavior is exposed to the custom
   * renderer as `onOpen` so it can fall back when it doesn't want to
   * handle a particular link. Pure generic — the chat package stays
   * Composio-unaware; the app layer is responsible for detecting
   * special URL patterns.
   */
  renderLink?: RenderLinkFn;
  /**
   * People whose "@Name" occurrences in this message should render as chips.
   * Empty/absent leaves the markdown pipeline exactly as it was.
   */
  mentions?: readonly MentionTarget[];
};

const streamdownPlugins = { cjk, code, math, mermaid };

export const MessageResponse = memo(
  ({
    className,
    onOpenLink,
    renderLink,
    mentions,
    ...props
  }: MessageResponseProps) => {
    const rehypePlugins = useMemo(() => {
      const { harden, ...beforeHarden } = defaultRehypePlugins;
      const chain: unknown[] = [
        ...Object.values(beforeHarden),
        fileLinkRehypePlugin,
        harden,
      ];
      if (mentions && mentions.length > 0) {
        const mentionPass: [typeof mentionRehypePlugin, MentionRehypeOptions] =
          [mentionRehypePlugin, { targets: mentions }];
        chain.push(mentionPass);
      }
      return chain as ComponentProps<typeof Streamdown>["rehypePlugins"];
    }, [mentions]);

    const components = useMemo(() => {
      const sharedComponents = {
        code: MarkdownCodeBlock,
        span: MentionMarkdownSpan,
      };
      if (!onOpenLink && !renderLink) return sharedComponents;
      const fn = onOpenLink;
      return {
        ...sharedComponents,
        a: ({
          href,
          children,
          node: _node,
          ...rest
        }: AnchorHTMLAttributes<HTMLAnchorElement> & {
          node?: unknown;
          [FILE_PATH_ATTR]?: string;
        }) => {
          const filePath = rest[FILE_PATH_ATTR];
          const url = filePath ?? (href as string);
          const kind = classifyMarkdownLink(url, children);
          if (kind === "plain") {
            return <span>{children}</span>;
          }
          const onOpen = () => fn?.(url);
          if (renderLink) {
            const custom = renderLink({ href: url, children, onOpen });
            if (custom != null) {
              return <>{custom}</>;
            }
          }
          if (filePath !== undefined) {
            const fileLabel =
              kind === "autolink" ? (
                fileNameOf(filePath)
              ) : (
                <>
                  {children}
                  {labelExtensionSuffix(
                    filePath,
                    markdownLinkText(children) ?? "",
                  )}
                </>
              );
            if (!fn) return <span>{fileLabel}</span>;
            return (
              <FileChip path={filePath} onOpen={onOpen}>
                {fileLabel}
              </FileChip>
            );
          }
          const label =
            kind === "autolink"
              ? (autolinkDisplay(children) ?? children)
              : children;
          if (!fn) return <span>{label}</span>;
          return (
            <Autolink href={url} onOpen={onOpen}>
              {label}
            </Autolink>
          );
        },
      };
    }, [onOpenLink, renderLink]);

    return (
      <ErrorBoundary
        fallback={
          <div className="size-full whitespace-pre-wrap break-words">
            {props.children}
          </div>
        }
      >
        <Streamdown
          className={cn(
            "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
            className,
          )}
          plugins={streamdownPlugins}
          components={components}
          rehypePlugins={rehypePlugins}
          tableMaxHeight={0}
          {...props}
        />
      </ErrorBoundary>
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating &&
    prevProps.onOpenLink === nextProps.onOpenLink &&
    prevProps.renderLink === nextProps.renderLink &&
    sameMentionTargets(prevProps.mentions, nextProps.mentions),
);

MessageResponse.displayName = "MessageResponse";

export type MessageToolbarProps = ComponentProps<"div">;

export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      "mt-4 flex w-full items-center justify-between gap-4",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
