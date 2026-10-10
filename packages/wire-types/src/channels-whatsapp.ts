import { channelConnectCommand, parseChannelLink } from "./channels";

export interface WhatsAppLink {
  code: string;
  expiresAt: string;
  phoneNumber: string;
  url: string;
}

export function parseWhatsAppLink(value: unknown): WhatsAppLink {
  const link = parseChannelLink(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid WhatsApp link");
  }
  const data = value as Record<string, unknown>;
  if (!/^[A-Z2-7]{16}$/.test(link.code)) {
    throw new Error("Invalid WhatsApp connection code");
  }
  if (
    typeof data.phoneNumber !== "string" ||
    !/^\+[1-9]\d{1,14}$/.test(data.phoneNumber)
  ) {
    throw new Error("Invalid WhatsApp phone number");
  }
  const command = channelConnectCommand(link.code);
  const base = `https://wa.me/${data.phoneNumber.slice(1)}?text=`;
  // Go's QueryEscape uses '+', while encodeURIComponent uses '%20'. Both
  // represent the one command without admitting extra URL parameters.
  if (
    data.url !== `${base}${encodeURIComponent(command)}` &&
    data.url !== `${base}${encodeURIComponent(command).replaceAll("%20", "+")}`
  ) {
    throw new Error("Invalid WhatsApp link URL");
  }
  return { ...link, phoneNumber: data.phoneNumber, url: data.url };
}
