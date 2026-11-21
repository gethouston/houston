import { describe, expect, test } from "vitest";
import { connectionBlock, type LoadedPage, pageBlock } from "./block-detect";
import { BrowserToolError } from "./errors";

const page = (status: number | null, title: string, html: string) =>
  ({ status, title, html }) satisfies LoadedPage;

const WALLS: Record<string, LoadedPage> = {
  cloudflare: page(
    403,
    "Just a moment...",
    `<html><head><title>Just a moment...</title></head><body><div id="challenge-body-text">Verifying you are human.</div>
<script>window._cf_chl_opt={cvId:'3'};</script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script></body></html>`,
  ),
  cloudflare_attention: page(
    403,
    "Attention Required! | Cloudflare",
    `<div id="cf-wrapper"><div class="cf-error-details"><h1>Sorry, you have been blocked</h1></div>
<p>Cloudflare Ray ID: <strong>8a1b2c3d4e5f</strong></p></div>`,
  ),
  cloudflare_branded: page(
    403,
    "Blocked - Indeed.com",
    `<h1>Request Blocked</h1><p>You have been blocked.</p><p class="ray">Cloudflare Ray ID: 8a1b2c</p>`,
  ),
  akamai: page(
    403,
    "Access Denied",
    `<html><head><title>Access Denied</title></head><body><h1>Access Denied</h1>
You don't have permission to access "http://www.example.com/" on this server.<p>
Reference #18.6f2d1402.1728000000.1a2b3c</p><p>https://errors.edgesuite.net/18.6f2d1402</p></body></html>`,
  ),
  perimeterx: page(
    200,
    "Robot or human?",
    `<h1>Robot or human?</h1><p>Activate and hold the button to confirm that you're human.</p>
<div id="px-captcha"></div><script>window._pxAppId = 'PXu6b0qd2S';</script>`,
  ),
  datadome: page(
    403,
    "example.com",
    `<body><iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqA" title="DataDome CAPTCHA"></iframe></body>`,
  ),
  imperva: page(
    200,
    "",
    `<iframe id="main-iframe" src="/_Incapsula_Resource?CWUDNSAI=24"></iframe>
<p>Request unsuccessful. Incapsula incident ID: 1234000560012345678-123456789</p>`,
  ),
  aws_waf: page(
    202,
    "",
    `<script>window.gokuProps = {"key":"AQIDAHj","iv":"CgAH","context":"x"};</script><script src="https://abc.token.awswaf.com/abc/challenge.js"></script>`,
  ),
  amazon_captcha: page(
    200,
    "Amazon.com",
    `<form method="get" action="/errors/validateCaptcha"><h4>Enter the characters you see below</h4></form>`,
  ),
  amazon_dogs: page(
    503,
    "Sorry! Something went wrong!",
    `<a href="/ref=cs_503_logo"><img src="https://images-na.ssl-images-amazon.com/images/G/01/error/logo._TTD_.png"></a>`,
  ),
  perimeterx_hold: page(
    403,
    "Access to this page has been denied",
    `<p>Press &amp; Hold to confirm you are a human (and not a bot).</p><script>window._pxAppId = 'PXu6b0qd2S';</script>`,
  ),
  imperva_denied: page(
    403,
    "",
    `<p>Request unsuccessful. Incapsula incident ID: 1234000560012345678-123456789</p>`,
  ),
  generic: page(
    429,
    "Too many requests",
    `<h1>Unusual traffic from your network</h1><p>Please complete the captcha.</p>`,
  ),
};

describe("pageBlock", () => {
  test("a denied page's scripts and styles are not its words", () => {
    const code =
      "<script>const t = 'unusual traffic';</script><style>.captcha{}</style >";
    expect(
      pageBlock(page(403, "Forbidden", `<h1>Forbidden</h1>${code}`)),
    ).toBeNull();
    expect(
      pageBlock(
        page(403, "Forbidden", `${code}<p>Please solve the captcha.</p>`),
      ),
    ).toEqual({ reason: "denied_status" });
  });

  test.each(Object.entries(WALLS))("%s is a block", (name, wall) => {
    const reason =
      name === "generic"
        ? "denied_status"
        : name === "aws_waf"
          ? name
          : name.split("_")[0];
    expect(pageBlock(wall)).toEqual({ reason });
  });

  test.each([
    ["an ordinary page", page(200, "Shop", "<h1>Products</h1>")],
    ["a plain 403", page(403, "403 Forbidden", "<h1>Forbidden</h1><hr>nginx")],
    [
      "a sign-in page that says access denied",
      page(403, "Access denied", "<p>Access denied. Please sign in.</p>"),
    ],
    [
      "a 403 sign-in page with a reCAPTCHA script",
      page(
        403,
        "Sign in",
        `<script src="https://www.google.com/recaptcha/api.js"></script><form><div class="g-recaptcha"></div></form>`,
      ),
    ],
    [
      "a Cloudflare site's ordinary 404",
      page(
        404,
        "Not found",
        `<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>`,
      ),
    ],
    [
      "a 200 page about captchas",
      page(200, "What is a CAPTCHA?", "<p>A captcha tells robots apart.</p>"),
    ],
    [
      "an AWS WAF site's ordinary page",
      page(200, "Hotels", `<script>window.gokuProps = {};</script>`),
    ],
    [
      "a 503 outage that is not Amazon's",
      page(503, "Sorry! Something went wrong!", "<p>Down for maintenance</p>"),
    ],
    ["no response at all", page(null, "", "")],
    [
      "a page quoting Imperva's block text",
      page(
        200,
        "Scraper gets blocked",
        `<p>I get "Request unsuccessful. Incapsula incident ID: 123-456".</p><pre>&lt;iframe src="/_Incapsula_Resource?CWUDNSAI=24"&gt;</pre>`,
      ),
    ],
    [
      "a page quoting Amazon's robot check",
      page(
        200,
        "Amazon scraping help",
        `<p>It says "To discuss automated access to Amazon data please contact api-services-support@amazon.com".</p><pre>&lt;form action="/errors/validateCaptcha"&gt;</pre>`,
      ),
    ],
    [
      "a page quoting PerimeterX's challenge",
      page(
        200,
        "Bypass Press & Hold?",
        `<p>PerimeterX shows Press &amp; Hold.</p><pre>&lt;div id="px-captcha"&gt;&lt;/div&gt; window._pxAppId</pre>`,
      ),
    ],
  ])("%s is not", (_, loaded) => {
    expect(pageBlock(loaded)).toBeNull();
  });
});

describe("connectionBlock", () => {
  test.each([
    "net::ERR_HTTP2_PROTOCOL_ERROR",
    "net::ERR_CONNECTION_RESET",
    "net::ERR_EMPTY_RESPONSE",
  ])("%s is an anti-bot reset", (code) => {
    const error = new Error(`page.goto: ${code} at https://shop.example/`);
    expect(connectionBlock(error)).toEqual({ reason: "connection_reset" });
  });

  test.each([
    "net::ERR_NAME_NOT_RESOLVED",
    "net::ERR_CONNECTION_REFUSED",
    "net::ERR_CONNECTION_TIMED_OUT",
    "net::ERR_TUNNEL_CONNECTION_FAILED",
  ])("%s means the site is down, not a block", (code) => {
    expect(connectionBlock(new Error(`page.goto: ${code}`))).toBeNull();
  });

  test("a fence refusal is the browser's own, never a block", () => {
    const refusal = new BrowserToolError(
      "url_refused",
      "net::ERR_CONNECTION_RESET",
    );
    expect(connectionBlock(refusal)).toBeNull();
    expect(connectionBlock("net::ERR_CONNECTION_RESET")).toBeNull();
  });
});
