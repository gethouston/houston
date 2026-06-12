#!/usr/bin/env bash
# ============================================================================
# 00-project.sh — create / select the GCP project and link its billing account.
#
# IDEMPOTENT: checks-if-exists before creating. The project create and the
# billing link both BILL or are hard to undo, so each is gated behind an
# explicit CONFIRM prompt (skip with --yes).
#
# Required env:
#   PROJECT_ID        e.g. houston-control-plane-prod
#   BILLING_ACCOUNT   e.g. 01ABCD-23EFGH-45IJKL  (gcloud billing accounts list)
# Optional env:
#   PROJECT_NAME      human-readable name (default: $PROJECT_ID)
#
# Usage:  ./00-project.sh [--yes]
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "${SCRIPT_DIR}/lib.sh"

parse_common_flags "$@"
require_cmd gcloud
require_env PROJECT_ID BILLING_ACCOUNT
PROJECT_NAME="${PROJECT_NAME:-$PROJECT_ID}"

# --- 1. Project ------------------------------------------------------------
log "Project: ${PROJECT_ID} (${PROJECT_NAME})"
if gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  ok "project '${PROJECT_ID}' already exists"
else
  run_billed "create GCP project '${PROJECT_ID}'" -- \
    gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME"
  ok "created project '${PROJECT_ID}'"
fi

# Make it the active project for subsequent scripts.
run gcloud config set project "$PROJECT_ID"

# --- 2. Billing link -------------------------------------------------------
log "Billing account: ${BILLING_ACCOUNT}"
CURRENT_BILLING="$(gcloud billing projects describe "$PROJECT_ID" \
  --format='value(billingAccountName)' 2>/dev/null || true)"

if [ "$CURRENT_BILLING" = "billingAccounts/${BILLING_ACCOUNT}" ]; then
  ok "project already linked to billing account '${BILLING_ACCOUNT}'"
elif [ -n "$CURRENT_BILLING" ]; then
  die "project is linked to a DIFFERENT billing account ('${CURRENT_BILLING}'). Refusing to relink automatically — fix this by hand."
else
  run_billed "link project '${PROJECT_ID}' to billing account '${BILLING_ACCOUNT}'" -- \
    gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
  ok "linked billing account '${BILLING_ACCOUNT}'"
fi

log "Done. Next: ./01-apis.sh"
