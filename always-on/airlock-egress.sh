#!/usr/bin/env bash
#
# Airlock L5 — per-tenant network egress allowlist.
#
# Closes the third prong of the lethal trifecta: exfiltration. A
# prompt-injected agent can try to POST your data to a C&C; this makes the
# packet never leave the box unless its destination is explicitly allowed.
#
# Mechanism: iptables `owner` match on the per-tenant uid range that Phase 1
# drops agents into (100000-159999, must match `TENANT_UID_BASE`/`SPAN` in
# engine/houston-terminal-manager/src/isolation/mod.rs). Traffic OWNED by a
# tenant uid is routed through the AIRLOCK_EGRESS chain: loopback (for the
# future broker), DNS, established return traffic, and the configured
# allowlist RETURN (allowed); everything else is DROPped. Non-tenant uids
# (the engine, the houston system user) are never touched, so the default
# deployment is unaffected.
#
# The allowlist is `HOUSTON_EGRESS_ALLOW` — a comma-separated list of CIDRs
# (e.g. the provider API ranges). For a production-grade *domain* allowlist,
# route egress through the credential broker (Phase 6) and allow only its
# loopback address here; iptables alone can't track CDN domains safely.
#
# Runs inside the container's own network namespace, so it needs CAP_NET_ADMIN
# but never touches the host firewall. See knowledge-base/agent-isolation.md.

set -euo pipefail

UID_RANGE="${HOUSTON_TENANT_UID_RANGE:-100000-159999}"
CHAIN="AIRLOCK_EGRESS"
ALLOWLIST="${HOUSTON_EGRESS_ALLOW:-}"

log() { printf '[airlock-egress] %s\n' "$*" >&2; }

# Build (or rebuild) the AIRLOCK_EGRESS chain and route tenant-uid output into
# it. Idempotent: safe to run on every container boot.
install_policy() {
  local ipt="$1" # iptables or ip6tables

  "$ipt" -N "$CHAIN" 2>/dev/null || "$ipt" -F "$CHAIN"

  # Return (=allow) loopback and DNS. (No conntrack/state rule needed: for an
  # allowed outbound connection every egress packet is owned by the tenant and
  # matches the same `-d <cidr>` RETURN, so the whole flow is covered without
  # depending on conntrack modules being present in a minimal container.)
  "$ipt" -A "$CHAIN" -o lo -j RETURN
  "$ipt" -A "$CHAIN" -p udp --dport 53 -j RETURN
  "$ipt" -A "$CHAIN" -p tcp --dport 53 -j RETURN

  # Return (=allow) each configured CIDR. ip6tables only gets v6 literals.
  if [ -n "$ALLOWLIST" ]; then
    local cidr
    IFS=',' read -ra cidrs <<< "$ALLOWLIST"
    for cidr in "${cidrs[@]}"; do
      cidr="$(echo "$cidr" | xargs)" # trim
      [ -z "$cidr" ] && continue
      if [ "$ipt" = "ip6tables" ] && [[ "$cidr" != *:* ]]; then continue; fi
      if [ "$ipt" = "iptables" ] && [[ "$cidr" == *:* ]]; then continue; fi
      "$ipt" -A "$CHAIN" -d "$cidr" -j RETURN
    done
  fi

  # Deny everything else a tenant tries to reach.
  "$ipt" -A "$CHAIN" -j DROP

  # Route tenant-uid-owned output into the chain (idempotent add).
  "$ipt" -C OUTPUT -m owner --uid-owner "$UID_RANGE" -j "$CHAIN" 2>/dev/null \
    || "$ipt" -A OUTPUT -m owner --uid-owner "$UID_RANGE" -j "$CHAIN"
}

install() {
  log "installing egress allowlist for uid range $UID_RANGE"
  log "allowlist (CIDRs): ${ALLOWLIST:-<none — only loopback + DNS>}"
  install_policy iptables
  # IPv6: no allowlist support in the MVP — deny all tenant v6 egress so it
  # can't be used to bypass the v4 allowlist. (ip6tables may be absent on
  # hosts with v6 disabled; tolerate that.)
  if command -v ip6tables >/dev/null 2>&1; then
    install_policy ip6tables || log "ip6tables unavailable — skipping v6"
  fi
  log "done"
}

# Run a curl as a given uid and report reachability (0 = reachable).
_curl_as() {
  local uid="$1" url="$2"
  setpriv --reuid "$uid" --regid "$uid" --clear-groups \
    curl -s -o /dev/null --max-time 5 "$url"
}

# Self-test: prove blocked-by-default → allowed-when-listed → root-unaffected.
# Intended to run inside a throwaway container with CAP_NET_ADMIN. Uses the
# 1.1.1.1 literal so the result doesn't depend on DNS.
selftest() {
  local probe_ip="${1:-1.1.1.1}"
  local tenant_uid=100001
  local fail=0

  log "=== Airlock L5 egress self-test (probe=$probe_ip) ==="

  HOUSTON_EGRESS_ALLOW="" ALLOWLIST="" install >/dev/null 2>&1
  ALLOWLIST="" install_policy iptables
  if _curl_as "$tenant_uid" "http://$probe_ip"; then
    log "FAIL  tenant egress reachable with empty allowlist (should be blocked)"; fail=1
  else
    log "PASS  tenant egress BLOCKED by default"
  fi

  ALLOWLIST="$probe_ip/32" install_policy iptables
  if _curl_as "$tenant_uid" "http://$probe_ip"; then
    log "PASS  tenant egress ALLOWED once $probe_ip/32 is on the allowlist"
  else
    log "FAIL  allowlisted destination still blocked"; fail=1
  fi

  if curl -s -o /dev/null --max-time 5 "http://$probe_ip"; then
    log "PASS  non-tenant (root) egress UNAFFECTED"
  else
    log "WARN  root egress failed — probe host may be unreachable from here"
  fi

  if [ "$fail" -eq 0 ]; then
    log "=== ALL EGRESS CHECKS PASSED ==="
  else
    log "=== EGRESS CHECKS FAILED ==="; return 1
  fi
}

case "${1:-install}" in
  install) install ;;
  selftest) selftest "${2:-1.1.1.1}" ;;
  *) echo "usage: $0 {install|selftest [probe_ip]}" >&2; exit 2 ;;
esac
