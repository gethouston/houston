#!/usr/bin/env bash
# ============================================================================
# 08-custom-domain.sh — map app.gethouston.ai to the houston-web Cloud Run
# service (stable URL for demos; one Supabase allow-list entry forever).
#
# What this does:
#   1. verifies the domain is verified for the project (fails with the
#      verification URL if not),
#   2. creates the Cloud Run domain mapping,
#   3. prints the exact DNS record(s) to create at the registrar,
#   4. prints the two manual follow-ups (DNS + Supabase Redirect URLs).
#
# What it can NOT do for you (account-owned surfaces):
#   - create the DNS record (registrar),
#   - add https://<domain>/** to Supabase Auth → Redirect URLs,
#   - re-verify domain ownership (Google Search Console).
#
# The SPA itself is domain-agnostic as long as it was built with a RELATIVE
# control-plane URL (VITE_CONTROL_PLANE_URL=/api — nginx proxies /api/ to the
# control plane on the same origin). If the current image baked an absolute
# https://….run.app/api URL, rebuild once with /api and this mapping never
# needs another build.
#
# Usage:
#   export PROJECT_ID=gethouston REGION=us-east1
#   export DOMAIN=app.gethouston.ai SERVICE=houston-web
#   ./cloud/scripts/08-custom-domain.sh [--yes]
# ============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "${SCRIPT_DIR}/lib.sh"

parse_common_flags "$@"
require_cmd gcloud
require_env PROJECT_ID
REGION="${REGION:-us-east1}"
DOMAIN="${DOMAIN:-app.gethouston.ai}"
SERVICE="${SERVICE:-houston-web}"

log "Checking domain verification for ${DOMAIN}"
# Cloud Run requires the root or exact domain to be verified for this account.
if ! gcloud domains list-user-verified --format="value(id)" | grep -qE "(^|\\.)gethouston\\.ai$"; then
  warn "gethouston.ai is not verified for this gcloud account."
  warn "Verify it first: gcloud domains verify gethouston.ai  (opens Search Console)"
  die "domain not verified — re-run after verification"
fi
ok "domain verified"

log "Creating Cloud Run domain mapping ${DOMAIN} → ${SERVICE} (${REGION})"
if gcloud beta run domain-mappings describe --domain "${DOMAIN}" \
    --region "${REGION}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  ok "mapping already exists — skipping create"
else
  confirm "Create domain mapping ${DOMAIN} → ${SERVICE}?"
  run gcloud beta run domain-mappings create \
    --service "${SERVICE}" \
    --domain "${DOMAIN}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}"
fi

log "DNS records the registrar needs (from the mapping):"
gcloud beta run domain-mappings describe --domain "${DOMAIN}" \
  --region "${REGION}" --project "${PROJECT_ID}" \
  --format="table(status.resourceRecords[].name, status.resourceRecords[].type, status.resourceRecords[].rrdata)"

cat <<EOF

${C_YEL}Manual follow-ups (account-owned):${C_RST}
  1. Create the DNS record(s) above at the gethouston.ai registrar
     (typically: CNAME  app  →  ghs.googlehosted.com.).
     Certificate provisioning starts automatically once DNS resolves
     (15 min – a few hours).
  2. Supabase → Authentication → URL Configuration → Redirect URLs:
     add   https://${DOMAIN}/**
     (keep the old run.app entry until the cutover is confirmed).
  3. If the current web image baked an ABSOLUTE control-plane URL, rebuild
     once with a relative one so the SPA is domain-agnostic:
       VITE_CONTROL_PLANE_URL=/api VITE_CP_SUPABASE_URL=... \\
       VITE_CP_SUPABASE_ANON_KEY=... SENTRY_DSN=... pnpm --filter houston-web build
     then rebuild + redeploy the web image (packages/web/Dockerfile).
  4. Smoke: https://${DOMAIN}/health is NOT a thing (SPA) — check
     https://${DOMAIN}/api/health returns {"status":"ok"} and sign-in works.
EOF
ok "done"
