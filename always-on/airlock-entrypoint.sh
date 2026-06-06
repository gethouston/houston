#!/usr/bin/env bash
#
# Airlock entrypoint for the Always-On container.
#
# When HOUSTON_ISOLATION is set, install the per-tenant egress allowlist (L5)
# as root, then exec the engine — which itself drops each agent subprocess into
# a per-tenant uid + Landlock + seccomp cell (L1-L4). When the flag is unset
# this is a transparent pass-through, so the default (un-isolated, USER houston)
# deployment is unaffected and can keep using the plain `CMD`.
#
# Requires, in Airlock mode: root + CAP_NET_ADMIN (iptables), CAP_SETUID /
# CAP_SETGID / CAP_CHOWN (per-tenant uid drop). See the airlock compose
# override and knowledge-base/agent-isolation.md.

set -euo pipefail

if [ -n "${HOUSTON_ISOLATION:-}" ]; then
  echo "[airlock] isolation ON — installing egress allowlist" >&2
  /usr/local/bin/airlock-egress.sh install
else
  echo "[airlock] HOUSTON_ISOLATION unset — running without isolation" >&2
fi

exec /usr/local/bin/houston-engine "$@"
