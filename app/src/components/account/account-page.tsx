import type { ReactNode } from "react";
import { PageContainer, PageHero } from "../shell/page-shell";

export function AccountPage(props: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <PageContainer className="py-10">
        <PageHero
          title={props.title}
          subtitle={props.subtitle}
          className="mb-8 px-1"
        />
        {props.children}
      </PageContainer>
    </div>
  );
}
