import type { Metadata } from "next";
import { StoreNav } from "@/components/store-nav";
import { MeClient } from "./me-client";

export const metadata: Metadata = {
  title: "Your agents",
  robots: { index: false, follow: false },
};

export default function MePage() {
  return (
    <main className="canvas-screen min-h-dvh bg-background text-ink">
      <StoreNav />
      <div className="mx-auto w-full max-w-[1040px] px-6 pt-6 pb-16 md:px-8">
        <MeClient />
      </div>
    </main>
  );
}
