import type { StoreLinkComponent } from "@houston-ai/store";
import type { MouseEvent, ReactNode } from "react";

export function actionLink(
  onNavigate: (href: string) => void,
): StoreLinkComponent {
  return function StoreActionLink({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children: ReactNode;
  }) {
    const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      onNavigate(href);
    };
    return (
      <a href={href} className={className} onClick={navigate}>
        {children}
      </a>
    );
  };
}
