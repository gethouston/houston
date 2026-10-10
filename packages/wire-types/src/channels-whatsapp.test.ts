import { describe, expect, it } from "vitest";
import { parseChannelStatus } from "./channels.ts";
import { parseWhatsAppLink } from "./channels-whatsapp.ts";

const link = {
  code: "ABCDEFGH234567AB",
  expiresAt: "2026-09-24T13:00:00Z",
  phoneNumber: "+15550001111",
  url: "https://wa.me/15550001111?text=connect+ABCDEFGH234567AB",
};

describe("WhatsApp channel wire shapes", () => {
  it("parses WhatsApp providers and opaque account labels", () => {
    expect(
      parseChannelStatus({
        providers: [{ id: "whatsapp", name: "WhatsApp", configured: false }],
        connections: [
          {
            id: "c1",
            provider: "whatsapp",
            accountLabel: "•••• 1111",
            spaceId: "personal",
            createdAt: link.expiresAt,
          },
        ],
      }).connections[0]?.accountLabel,
    ).toBe("•••• 1111");
  });

  it("accepts only the exact number and encoded command", () => {
    expect(parseWhatsAppLink(link)).toEqual(link);
    expect(
      parseWhatsAppLink({ ...link, url: link.url.replaceAll("+", "%20") }),
    ).toEqual({ ...link, url: link.url.replaceAll("+", "%20") });
    for (const changed of [
      { code: "short" },
      { phoneNumber: "15550001111" },
      { phoneNumber: "+05550001111" },
      { url: "https://evil.test/?text=connect+ABCDEFGH234567AB" },
      { url: `${link.url}&redirect=https://evil.test` },
      { url: link.url.replace("15550001111", "15550002222") },
      { url: link.url.replace("ABCDEFGH234567AB", "ABCDEFGH234567AC") },
      { expiresAt: "never" },
    ])
      expect(() => parseWhatsAppLink({ ...link, ...changed })).toThrow();
  });
});
