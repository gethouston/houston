/**
 * /me — the owner dashboard (your listings).
 *
 * Everything is client-side: the page requires a signed-in session and reads the
 * caller's agents through the gateway with a bearer, so nothing is server-rendered
 * and the route is never indexed.
 */
import type { Metadata } from "next";
import { StoreNav } from "@/components/store-nav";
import { UserMenu } from "@/components/user-menu";
import { MeClient } from "./me-client";

export const metadata: Metadata = {
  title: "Your agents",
  robots: { index: false, follow: false },
};

export default function MePage() {
  return (
    <main className="canvas-screen min-h-screen bg-background text-ink">
      <StoreNav />
      <div className="mx-auto w-full max-w-[1040px] px-6 pt-6 pb-16 md:px-8">
        <div className="mb-6 flex justify-end">
          <UserMenu />
        </div>
        <MeClient />
      </div>
    </main>
  );
}
