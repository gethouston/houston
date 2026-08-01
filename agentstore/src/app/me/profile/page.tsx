/**
 * /me/profile — the creator-profile editor.
 *
 * Fully client-side behind a signed-in session (nothing is server-rendered and
 * the route is never indexed): it reads and writes the caller's profile through
 * the gateway with a bearer.
 */
import type { Metadata } from "next";
import { StoreNav } from "@/components/store-nav";
import { ProfileClient } from "./profile-client";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return (
    <main className="canvas-screen min-h-screen bg-background text-ink">
      <StoreNav />
      <div className="mx-auto w-full max-w-2xl px-6 pt-6 pb-16">
        <ProfileClient />
      </div>
    </main>
  );
}
