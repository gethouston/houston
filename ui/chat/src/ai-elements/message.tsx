"use client";

import { Button } from "@houston-ai/core";
import {
  ButtonGroup,
  ButtonGroupText,
} from "@houston-ai/core";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@houston-ai/core";
import { cn, ErrorBoundary } from "@houston-ai/core";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { UIMessage } from "ai";
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import type { AnchorHTMLAttributes, ComponentProps, HTMLAttributes, ReactElement, ReactNode } from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Streamdown } from "streamdown";
import { MarkdownCodeBlock } from "../markdown-code-block";
import { classifyMarkdownLink } from "../markdown-link";

const MessageAvatarContext = createContext<React.ReactNode | undefined>(undefined);

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
  /** Optional badge avatar shown on the message bubble (e.g., channel logo). */
  avatar?: React.ReactNode;
};

export const Message = ({ className, from, avatar, children, ...props }: MessageProps) => (
  <MessageAvatarContext.Provider value={avatar}>
    <div
      className={cn(
        "group flex w-full flex-col gap-2",
        from === "user" ? "is-user ml-auto max-w-[70%] justify-end" : "is-assistant",
        className
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
    <div className={cn("relative", avatar && "group-[.is-user]:mr-4")}>
      <div
        className={cn(
          "flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-base leading-6",
          "group-[.is-user]:ml-auto group-[.is-user]:rounded-[22px] group-[.is-user]:bg-muted group-[.is-user]:px-4 group-[.is-user]:py-2.5 group-[.is-user]:text-foreground",
          "group-[.is-assistant]:text-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
      {avatar && (
        <div className="absolute -bottom-1 -right-3.5 group-[.is-assistant]:-left-3.5 group-[.is-assistant]:right-auto">
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
  null
);

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext);

  if (!context) {
    throw new Error(
      "MessageBranch components must be used within MessageBranch"
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
    [onBranchChange]
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
    [branches, currentBranch, goToNext, goToPrevious]
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
    [children]
  );

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray);
    }
  }, [childrenArray, branches, setBranches]);

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden"
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

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null;
  }

  return (
    <ButtonGroup
      className={cn(
        "[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md",
        className
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
        "border-none bg-transparent text-muted-foreground shadow-none",
        className
      )}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  );
};

/**
 * Props passed to a custom link renderer. `onOpen` is the default
 * open-URL handler (what the built-in button would call on click) — the
 * custom renderer can invoke it directly or ignore it. Returning
 * `undefined` (or `null`) from the renderer falls back to the default
 * button, which lets the app handle *only* specific URL patterns and
 * leave everything else alone.
 */
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
};

const streamdownPlugins = { cjk, code, math, mermaid };

export const MessageResponse = memo(
  ({ className, onOpenLink, renderLink, ...props }: MessageResponseProps) => {
    const components = useMemo(() => {
      const sharedComponents = {
        code: MarkdownCodeBlock,
      };
      if (!onOpenLink && !renderLink) return sharedComponents;
      const fn = onOpenLink;
      return {
        ...sharedComponents,
        a: ({ href, children, node: _node }: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => {
          const kind = classifyMarkdownLink(href, children);
          // No href → nothing to open.
          if (kind === "plain") {
            return <span>{children}</span>;
          }
          const url = href as string;
          const onOpen = () => fn?.(url);
          // The app's custom renderer gets first say on every link (its
          // contract). When it returns undefined/null we fall through to
          // the defaults below, so the app can override only specific URL
          // patterns (e.g. Composio connect cards) and leave the rest alone.
          if (renderLink) {
            const custom = renderLink({ href: url, children, onOpen });
            if (custom != null) {
              return <>{custom}</>;
            }
          }
          // Bare URL the agent dropped in chat → inline, clickable link that
          // opens in the system browser (issue #358), not dead text. Only
          // render it interactive when there's an open handler; otherwise it
          // would look clickable but do nothing.
          if (kind === "autolink") {
            if (!fn) return <span>{children}</span>;
            return (
              <a
                href={url}
                rel="noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  onOpen();
                }}
                className="text-primary underline-offset-4 hover:underline [overflow-wrap:anywhere]"
              >
                {children}
              </a>
            );
          }
          // Labeled link (text distinct from URL) → button with text + icon.
          return (
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={onOpen}
            >
              {children}
              <ExternalLinkIcon size={11} strokeWidth={2} />
            </Button>
          );
        },
      };
    }, [onOpenLink, renderLink]);

    return (
      // Degrade to the raw markdown text if a render-time failure escapes
      // Streamdown (e.g. shiki's JS regex engine on an older WebView) so a
      // single message can't blank the whole chat.
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
            className
          )}
          plugins={streamdownPlugins}
          components={components}
          {...props}
        />
      </ErrorBoundary>
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating &&
    prevProps.onOpenLink === nextProps.onOpenLink &&
    prevProps.renderLink === nextProps.renderLink
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
      className
    )}
    {...props}
  >
    {children}
  </div>
);
