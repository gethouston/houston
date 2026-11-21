export type BlockReason =
  | "cloudflare"
  | "akamai"
  | "perimeterx"
  | "datadome"
  | "imperva"
  | "aws_waf"
  | "amazon"
  | "denied_status"
  | "connection_reset";

export type Block =
  | { reason: BlockReason }
  | { reason: "backup_proxy"; code: string };

export interface LoadedPage {
  status: number | null;
  title: string;
  html: string;
}

const DENIED_STATUSES = new Set([403, 429, 451, 503]);

const denied = (status: number | null) =>
  status !== null && DENIED_STATUSES.has(status);

const BOT_WORDS =
  /\bcaptcha\b|unusual traffic|are you a robot|not a robot|robot or human|verify (?:that )?you are (?:a )?human|automated (?:access|queries|requests)|you have been blocked|request blocked|bot detection/i;

interface Wall {
  reason: BlockReason;
  matches(page: LoadedPage): boolean;
}

const WALLS: readonly Wall[] = [
  {
    reason: "cloudflare",
    matches: ({ title, html }) =>
      /^(just a moment|attention required! \| cloudflare)/i.test(title) &&
      /challenges\.cloudflare\.com|cf[-_]chl|cf-error-details|cloudflare ray id/i.test(
        html,
      ),
  },
  {
    reason: "cloudflare",
    matches: ({ status, title, html }) =>
      denied(status) &&
      /\bblocked\b/i.test(title) &&
      /cloudflare ray id|cf-ray|cf-error-details|cdn-cgi\//i.test(html),
  },
  {
    reason: "akamai",
    matches: ({ status, title, html }) =>
      status === 403 &&
      /^access denied$/i.test(title.trim()) &&
      /Reference #/.test(html) &&
      /errors\.edgesuite\.net|You don't have permission to access/i.test(html),
  },
  {
    reason: "perimeterx",
    matches: ({ status, title, html }) =>
      /<div[^>]+id=["']px-captcha["']/.test(html) ||
      (/^robot or human\??$/i.test(title.trim()) &&
        /perimeterx|_pxAppId|px-cloud|px-cdn/i.test(html)) ||
      (denied(status) &&
        /Press (?:&amp;|&) Hold/.test(html) &&
        /perimeterx|_pxAppId/i.test(html)),
  },
  {
    reason: "datadome",
    matches: ({ html }) =>
      /<iframe[^>]+src=["'][^"']*captcha-delivery\.com/i.test(html),
  },
  {
    reason: "imperva",
    matches: ({ status, html }) =>
      /Incapsula incident ID/i.test(html) &&
      (denied(status) ||
        /<(?:iframe|script)[^>]+src=["'][^"']*_Incapsula_Resource/i.test(html)),
  },
  {
    reason: "aws_waf",
    matches: ({ status, html }) =>
      (status === 202 || status === 405) && /window\.gokuProps/.test(html),
  },
  {
    reason: "amazon",
    matches: ({ status, title, html }) =>
      /<form[^>]+action=["'][^"']*\/errors\/validateCaptcha/.test(html) ||
      (denied(status) &&
        /To discuss automated access to Amazon data please contact/.test(
          html,
        )) ||
      (status === 503 &&
        /^sorry! something went wrong!?$/i.test(title.trim()) &&
        /amazon\.com|media-amazon\.com|ssl-images-amazon/i.test(html)),
  },
];

const SCRIPT_OR_STYLE =
  /<script\b[\s\S]*?<\/script[^>]*>|<style\b[\s\S]*?<\/style[^>]*>/i;

export function pageBlock(page: LoadedPage): Block | null {
  const wall = WALLS.find((w) => w.matches(page));
  if (wall) return { reason: wall.reason };
  if (!denied(page.status)) return null;
  const prose = page.html.split(SCRIPT_OR_STYLE).join("\n");
  return BOT_WORDS.test(`${page.title}\n${prose}`)
    ? { reason: "denied_status" }
    : null;
}

const BLOCKED_CONNECTION =
  /net::ERR_(?:HTTP2_PROTOCOL_ERROR|CONNECTION_RESET|EMPTY_RESPONSE)\b/;

export function connectionBlock(error: unknown): Block | null {
  if (!(error instanceof Error) || error.name === "BrowserToolError")
    return null;
  return BLOCKED_CONNECTION.test(error.message)
    ? { reason: "connection_reset" }
    : null;
}
