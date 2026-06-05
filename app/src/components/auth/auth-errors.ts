/**
 * Map raw provider / Supabase error strings to a short, actionable sentence.
 * The original message is appended in parentheses so support still has the
 * technical detail when triaging from logs.
 *
 * Shared by the sign-in screen and the email sign-in form. Copy is English to
 * match the (currently English-only) sign-in flow; it moves to `t()` when that
 * whole flow is internationalized.
 */
export function prettifyAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("identity") && msg.includes("already")) {
    return "That email is already signed in with another provider. Use the original sign-in option, or contact support to merge accounts.";
  }
  if (msg.includes("aadsts50020") || msg.includes("does not exist in tenant")) {
    return "Your Microsoft account isn't allowed in this Houston workspace. Try a different account, or ask your admin to invite it.";
  }
  if (msg.includes("aadsts700016") || msg.includes("application with identifier")) {
    return "Microsoft sign-in isn't fully configured for Houston yet. Please contact support.";
  }
  if (msg.includes("aadsts65001") || msg.includes("consent")) {
    return "Microsoft needs admin consent before this account can sign in. Ask your IT admin to approve Houston, then try again.";
  }
  if (msg.includes("redirect") && msg.includes("invalid")) {
    return "The sign-in callback URL isn't allow-listed. Please contact support.";
  }
  if (msg.includes("provider") && msg.includes("not enabled")) {
    return "This sign-in option isn't turned on for Houston yet. Try another option.";
  }
  if (msg.includes("otp") || (msg.includes("token") && msg.includes("expired"))) {
    return "That code is wrong or expired. Request a new one and try again.";
  }
  if (msg.includes("authorization code")) {
    return "Sign-in didn't complete cleanly. Please try again.";
  }
  if (msg.includes("rate") && msg.includes("limit")) {
    return "Too many attempts. Wait a minute, then try again.";
  }
  // Fallback: show the raw message so the user has something to copy when
  // reporting. Keep it bounded so the UI doesn't blow up.
  const trimmed = raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
  return `Sign-in failed: ${trimmed}`;
}
