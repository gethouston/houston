import type { Metadata } from "next";
import { ClaimClient } from "./claim-client";

// The claim flow is driven entirely client-side from the URL fragment (#t=…);
// it must never be indexed or previewed by a crawler.
export const metadata: Metadata = {
  title: "Claim your agent",
  robots: { index: false, follow: false },
};

export default function ClaimPage() {
  return <ClaimClient />;
}
