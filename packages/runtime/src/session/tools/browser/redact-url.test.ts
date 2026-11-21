import { expect, test } from "vitest";
import { isSecretName, redactUrl } from "./redact-url";

test("a GET-submitted password never shows in the address", () => {
  expect(
    redactUrl("https://site.test/login?username=student&password=Hunter2"),
  ).toBe("https://site.test/login?username=student&password=[hidden]");
});

test.each([
  ["pwd", "https://a.test/?pwd=x", "https://a.test/?pwd=[hidden]"],
  ["pw", "https://a.test/?pw=x", "https://a.test/?pw=[hidden]"],
  ["pword", "https://a.test/?pword=x", "https://a.test/?pword=[hidden]"],
  ["jwt", "https://a.test/magic?jwt=eyJ", "https://a.test/magic?jwt=[hidden]"],
  ["bearer", "https://a.test/?bearer=t", "https://a.test/?bearer=[hidden]"],
  [
    "Firebase oobCode",
    "https://a.test/auth?mode=signIn&oobCode=X",
    "https://a.test/auth?mode=signIn&oobCode=[hidden]",
  ],
  [
    "reset, activation, one-time and invite codes",
    "https://a.test/?reset_code=1&activation_code=2&one_time_code=3&invite_code=4",
    "https://a.test/?reset_code=[hidden]&activation_code=[hidden]&one_time_code=[hidden]&invite_code=[hidden]",
  ],
  [
    "escaped address in a value",
    "https://a.test/login?next=%2Fcb%3Fcode%3DS%26x%3D1",
    "https://a.test/login?next=%2Fcb%3Fcode%3D%5Bhidden%5D%26x%3D1",
  ],
  [
    "escaped redirect with a fragment token",
    "https://a.test/?redirect_uri=https%3A%2F%2Fb.test%2Fcb%23access_token%3DS",
    "https://a.test/?redirect_uri=https%3A%2F%2Fb.test%2Fcb%23access_token%3D%5Bhidden%5D",
  ],
  [
    "escaped value with nothing secret is kept byte for byte",
    "https://a.test/?next=%2Fsearch%3Fq%3Dshoes%2Bred",
    "https://a.test/?next=%2Fsearch%3Fq%3Dshoes%2Bred",
  ],
  ["otp", "https://a.test/?OTP=123456", "https://a.test/?OTP=[hidden]"],
  [
    "oauth code and state",
    "https://a.test/cb?code=abc&state=s1",
    "https://a.test/cb?code=[hidden]&state=s1",
  ],
  [
    "fragment token",
    "https://a.test/cb#access_token=t&expires_in=3600",
    "https://a.test/cb#access_token=[hidden]&expires_in=3600",
  ],
  ["api key", "https://a.test/?api_key=k", "https://a.test/?api_key=[hidden]"],
  [
    "secret",
    "https://a.test/?client_secret=k",
    "https://a.test/?client_secret=[hidden]",
  ],
  [
    "S3 presigned signature and credential",
    "https://b.s3.test/f?X-Amz-Credential=c&X-Amz-Signature=s&X-Amz-Expires=60",
    "https://b.s3.test/f?X-Amz-Credential=[hidden]&X-Amz-Signature=[hidden]&X-Amz-Expires=60",
  ],
  [
    "Azure SAS sig",
    "https://a.blob.test/c/f?sv=2022&sig=abc%3D&se=2026",
    "https://a.blob.test/c/f?sv=2022&sig=[hidden]&se=2026",
  ],
  [
    "CAS ticket",
    "https://a.test/?ticket=ST-1",
    "https://a.test/?ticket=[hidden]",
  ],
  [
    "SAML response",
    "https://a.test/acs?SAMLResponse=PHN&RelayState=r",
    "https://a.test/acs?SAMLResponse=[hidden]&RelayState=r",
  ],
  [
    "path matrix session id",
    "https://a.test/app;jsessionid=ABC123/page?x=1",
    "https://a.test/app;jsessionid=[hidden]/page?x=1",
  ],
  ["userinfo", "https://me:pw@a.test/", "https://me:hidden@a.test/"],
  [
    "hash-routed OAuth code",
    "https://a.com/#/callback?code=OAUTH",
    "https://a.com/#/callback?code=[hidden]",
  ],
  [
    "hash-routed token after other pairs",
    "https://a.com/#/cb?state=s&access_token=t",
    "https://a.com/#/cb?state=s&access_token=[hidden]",
  ],
  [
    "a code behind an unescaped ? in the query",
    "https://a.com/go?next=/cb?code=X",
    "https://a.com/go?next=/cb?code=[hidden]",
  ],
  [
    "run-together names",
    "https://a.com/?apikey=1&sessionid=2&accesstoken=3&userpass=4",
    "https://a.com/?apikey=[hidden]&sessionid=[hidden]&accesstoken=[hidden]&userpass=[hidden]",
  ],
  [
    "path session id before an empty query",
    "https://a.com/login;jsessionid=X?",
    "https://a.com/login;jsessionid=[hidden]?",
  ],
])("hides %s", (_name, raw, shown) => {
  expect(redactUrl(raw)).toBe(shown);
});

test.each([
  "password",
  "pass",
  "passwd",
  "pin",
  "user_pin",
  "code",
  "auth_code",
  "verificationCode",
  "sms-code",
  "2FACode",
  "token",
  "refresh_token",
  "id_token",
  "access_token",
  "oauth_token",
  "secret",
  "key",
  "apiKey",
  "api-key",
  "sig",
  "signature",
  "X-Amz-Signature",
  "ticket",
  "SAMLResponse",
  "assertion",
  "auth",
  "authorization",
  "session",
  "session_id",
  "sessionId",
  "sid",
  "jsessionid",
  "PHPSESSID",
  "credential",
  "credentials",
  "code_verifier",
  "apikey",
  "sessionid",
  "accesstoken",
  "userpass",
  "newpassword",
  "passcode",
  "pass1",
  "password2",
  "passphrase",
  "user_password_confirm",
  "oauthtoken",
  "authcode",
  "verificationcode",
  "smscode",
  "otpcode",
  "secretkey",
  "privatekey",
  "PrivateKey",
  "bypass",
  "passport",
  "author",
])("%s is a secret's name", (name) => {
  expect(isSecretName(name)).toBe(true);
});

test.each([
  "keywords",
  "monkey",
  "passengers",
  "zipcode",
  "country_code",
  "postal_code",
  "promo_code",
  "footprint",
  "state",
  "nonce",
  "q",
  "page",
  "RelayState",
  "zipcode",
  "postcode",
  "postalcode",
  "countrycode",
  "languagecode",
  "langcode",
  "promocode",
  "currencycode",
  "keyword",
  "Passengers",
  "compass",
  "design",
  "shipping",
  "inside",
  "",
])("%s is an ordinary name", (name) => {
  expect(isSecretName(name)).toBe(false);
});

test("an ordinary address, a plain fragment and non-URLs are unchanged", () => {
  for (const raw of [
    "https://a.test/search?q=shoes&page=2",
    "https://a.test/search?keywords=monkey&passengers=2&zipcode=10001&country_code=US&footprint=1",
    "https://a.test/docs#install",
    "https://a.test/a;v=1/b",
    "https://a.test/p?",
    "https://a.test/p#",
    "https://a.test/p?#",
    "https://a.test/#/route?tab=2",
    "about:blank",
    "data:text/html;charset=utf-8,hi",
    "not a url",
  ])
    expect(redactUrl(raw)).toBe(raw);
});
