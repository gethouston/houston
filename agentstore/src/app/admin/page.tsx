import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AdminConsole } from "./admin-console";

export const metadata: Metadata = {
  title: "Moderation",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <>
      <SiteHeader />
      <AdminConsole />
    </>
  );
}
