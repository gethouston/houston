#!/usr/bin/env bash
set -euo pipefail
main=$1
candidate=$2
live=${3:-}

MAX_RELEASE_COMMITS=20

main_base() {
  local commit base distance
  commit=$(git rev-parse --verify --quiet "$1^{commit}") || {
    echo "::error::Commit $1 is not in this repository" >&2
    return 1
  }
  if git merge-base --is-ancestor "$commit" "$main"; then
    echo "$commit"
    return 0
  fi
  if ! git tag --points-at "$commit" --list 'cloud-v*' | grep -q .; then
    echo "::error::$1 is neither on main nor a cloud-v release commit" >&2
    return 1
  fi
  base=$(git merge-base "$commit" "$main") || {
    echo "::error::Release commit $1 shares no history with main" >&2
    return 1
  }
  distance=$(git rev-list --count "$base..$commit")
  if [ "$distance" -gt "$MAX_RELEASE_COMMITS" ]; then
    echo "::error::Release commit $1 is $distance commits off main (max $MAX_RELEASE_COMMITS)" >&2
    return 1
  fi
  echo "$base"
}

candidate_base=$(main_base "$candidate")
if [ -n "$live" ]; then
  live_base=$(main_base "$live")
  if [ "$live_base" != "$candidate_base" ] &&
    git merge-base --is-ancestor "$candidate_base" "$live_base"; then
    echo "::error::$candidate is older than the live bundle's commit $live" >&2
    exit 1
  fi
  if ! git merge-base --is-ancestor "$live_base" "$candidate_base"; then
    missing=$(git rev-list --count "$candidate_base..$live_base")
    if [ "$missing" -gt "$MAX_RELEASE_COMMITS" ]; then
      echo "::error::$candidate lacks $missing commits of the live bundle $live" >&2
      exit 1
    fi
    echo "::notice::$candidate and the live bundle $live branch from main separately"
  fi
fi
