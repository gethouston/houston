import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { ClaimClient } from "./claim-client";

export const metadata: Metadata = {
  title: "Claim your agent",
  robots: { index: false, follow: false },
};

export default function ClaimPage() {
  return (
    <>
      <SiteHeader />
      <ClaimClient />
    </>
  );
}
