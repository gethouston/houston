/**
 * /admin — the moderation console.
 *
 * Access control lives entirely in the gateway: the admin API matches the
 * signed-in user's UID against `GW_STORE_ADMIN_UIDS` and fail-closes to 404, so
 * this page can render for everyone — a non-admin simply gets an "access" notice
 * from the tabs. Nothing sensitive is server-rendered; the page is never indexed.
 */
import type { Metadata } from "next";
import { AdminConsole } from "./admin-console";

export const metadata: Metadata = {
  title: "Moderation",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminConsole />;
}
