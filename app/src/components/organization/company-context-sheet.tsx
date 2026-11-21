import {
  Button,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  useIsMobile,
} from "@houston-ai/core";
import { BookOpen } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function CompanyContextTrigger() {
  const { t } = useTranslation("teams");
  return (
    <SheetTrigger asChild>
      <Button variant="outline" size="sm" data-company-context-trigger="">
        <BookOpen aria-hidden />
        {t("org.companyContext.title")}
      </Button>
    </SheetTrigger>
  );
}

export function CompanyContextSheetContent({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useTranslation("teams");
  const isMobile = useIsMobile();
  return (
    <SheetContent
      side={isMobile ? "bottom" : "right"}
      data-testid="company-context-sheet"
      className={
        isMobile
          ? "h-dvh max-h-[80dvh] gap-0 rounded-t-2xl pb-safe"
          : "gap-0 sm:max-w-2xl"
      }
    >
      <SheetHeader className="pr-12">
        <SheetTitle>{t("org.companyContext.title")}</SheetTitle>
        <SheetDescription>
          {t("org.companyContext.description")}
        </SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 px-4 pb-4">{children}</div>
    </SheetContent>
  );
}
