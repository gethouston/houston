# shellcheck shell=bash
# ============================================================================
# Shared helpers for the Houston control plane gcloud provisioning scripts.
#
# Sourced by 00-project.sh .. 03-verify-sandbox.sh. Holds the safety rails:
#   - require_env / require_cmd      : fail fast on missing config or tooling
#   - run / run_billed               : echo the exact command, then run it
#   - confirm                        : explicit "type CONFIRM" gate for billed
#                                      or hard-to-undo steps (skipped with --yes)
#   - parse_common_flags             : sets ASSUME_YES from --yes / -y
#
# Style: shellcheck-clean. No secrets are ever printed or hard-coded; all
# project / billing identifiers come from the environment.
#
# NOTE: this file is `source`d, not executed, so it intentionally does NOT set
# its own `set -euo pipefail` — the caller owns shell options.
# ============================================================================

# Colors only when stdout is a TTY (keeps CI / piped logs clean).
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_CYN=$'\033[36m'; C_RST=$'\033[0m'
else
  C_RED=''; C_GRN=''; C_YEL=''; C_CYN=''; C_RST=''
fi

# ASSUME_YES is flipped on by --yes / -y. Default: prompt for every billed step.
ASSUME_YES="${ASSUME_YES:-0}"

log()  { printf '%s\n' "${C_CYN}==>${C_RST} $*"; }
ok()   { printf '%s\n' "${C_GRN}  ok${C_RST} $*"; }
warn() { printf '%s\n' "${C_YEL}  warn${C_RST} $*" >&2; }

# die: print to stderr and exit non-zero. Never swallow a failure.
die() { printf '%s\n' "${C_RED}error:${C_RST} $*" >&2; exit 1; }

# parse_common_flags "$@": consume --yes / -y, ignore the rest (each script may
# read additional flags itself). Call early in every script.
parse_common_flags() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --yes|-y) ASSUME_YES=1 ;;
      *) : ;;
    esac
  done
}

# require_cmd <name...>: ensure each command exists on PATH, else die.
require_cmd() {
  local c
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || die "required command not found on PATH: '$c'"
  done
}

# require_env <VAR...>: ensure each named env var is set and non-empty, else die.
require_env() {
  local v
  for v in "$@"; do
    if [ -z "${!v:-}" ]; then
      die "required environment variable '$v' is not set (see README.md)"
    fi
  done
}

# run <cmd...>: echo the exact command, then execute it. Aborts the script on
# a non-zero exit (errors are surfaced, never swallowed).
run() {
  printf '%s\n' "${C_CYN}  \$${C_RST} $*"
  "$@" || die "command failed (exit $?): $*"
}

# confirm <reason>: explicit gate for a billed / hard-to-undo action. Echoes the
# reason and requires the operator to type CONFIRM. Skipped only with --yes.
confirm() {
  local reason="$1"
  if [ "$ASSUME_YES" = "1" ]; then
    warn "auto-confirmed (--yes): ${reason}"
    return 0
  fi
  printf '%s\n' "${C_YEL}  this action BILLS or is hard to undo:${C_RST} ${reason}"
  local reply=""
  read -r -p "  type CONFIRM to proceed (anything else aborts): " reply
  if [ "$reply" != "CONFIRM" ]; then
    die "aborted by operator (no CONFIRM)"
  fi
}

# run_billed <reason> -- <cmd...>: confirm the billed action, echo the exact
# command, then run it. The literal `--` separates the reason from the command.
run_billed() {
  local reason="$1"; shift
  [ "${1:-}" = "--" ] || die "run_billed: expected '--' after reason, got '${1:-}'"
  shift
  printf '%s\n' "${C_YEL}  about to run (BILLED):${C_RST} $*"
  confirm "$reason"
  run "$@"
}
