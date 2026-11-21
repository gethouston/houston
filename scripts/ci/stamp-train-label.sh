#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 3 ]; then
  echo "usage: $0 <label> <commit> <message>" >&2
  exit 2
fi
LABEL="$1"
TARGET="$2"
MESSAGE="$3"
REMOTE="${TRAIN_LABEL_REMOTE:-origin}"

emit() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf 'stamped=%s\nreason=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"
  fi
}

one_line() {
  tr -d '\r' | sed -e 's/^remote: //' -e 's/^[[:space:]]*//' \
    | grep -v '^$' | tr '\n' ' ' | sed -e 's/ *$//'
}
annotate() {
  printf '::%s::%s\n' "$1" "$(printf '%s' "$2" | sed -e 's/%/%25/g')"
}

if EXISTING=$(git rev-parse -q --verify "refs/tags/${LABEL}^{commit}" 2>/dev/null); then
  if [ "$EXISTING" = "$TARGET" ]; then
    echo "::notice::${LABEL} already points at ${TARGET} (release re-published), nothing to do."
    emit unchanged "already at ${TARGET}"
    exit 0
  fi
  REASON="${LABEL} already exists at ${EXISTING}, but this train resolves to ${TARGET}; a train label never moves"
  annotate error "${REASON}. Left untouched, investigate before re-tagging."
  emit false "$REASON"
  exit 0
fi

git config user.name "houston-release-bot"
git config user.email "release-bot@users.noreply.github.com"

if ! TAG_LOG=$(git tag -a "$LABEL" -m "$MESSAGE" "$TARGET" 2>&1); then
  REASON=$(printf '%s\n' "$TAG_LOG" | one_line || true)
  annotate warning "${LABEL} not created at ${TARGET}: ${REASON}"
  emit false "$REASON"
  exit 0
fi

if PUSH_LOG=$(git push "$REMOTE" "refs/tags/${LABEL}" 2>&1); then
  echo "::notice::Stamped ${LABEL} at ${TARGET}"
  emit true pushed
  exit 0
fi

printf '%s\n' "$PUSH_LOG"
git tag -d "$LABEL" >/dev/null 2>&1 || true
REASON=$(printf '%s\n' "$PUSH_LOG" | one_line || true)
annotate warning "${LABEL} not stamped at ${TARGET}: ${REASON}"
emit false "$REASON"
exit 0
