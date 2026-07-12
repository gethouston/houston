/**
 * /me — the owner dashboard (your listings).
 *
 * Everything is client-side: the page requires a signed-in session and reads the
 * caller's agents through the gateway with a bearer, so nothing is server-rendered
 * and the route is never indexed.
 */
import type { Metadata } from "next";
import { MeClient } from "./me-client";

export const metadata: Metadata = {
  title: "Your agents",
  robots: { index: false, follow: false },
};

export default function MePage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <MeClient />
    </main>
  );
}
