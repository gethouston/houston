#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <out-file>" >&2
  exit 2
fi
OUT="$1"
: "${TAG:?TAG is required}"
: "${VERSION:?VERSION is required}"
: "${REGISTRY:?REGISTRY is required}"

half() {
  if [ -z "$3" ]; then
    echo null
    return
  fi
  jq -n --arg repo "$1" --arg label "$2" --arg sha "$3" --arg digest "$4" \
    --arg dispatched "$5" --arg stamped "$6" --arg reason "$7" '{
      sha: $sha,
      digest: $digest,
      image: ($repo + "@" + $digest),
      dispatched: ($dispatched == "true"),
      label: {
        name: $label,
        stamped: ($stamped == "true" or $stamped == "unchanged"),
        reason: (if $reason == "" then null else $reason end)
      }
    }'
}

ENGINE=$(half "${REGISTRY}/engine-pod" "label/engine-pod-v${VERSION}" \
  "${ENGINE_SHA:-}" "${ENGINE_DIGEST:-}" "${ENGINE_DISPATCHED:-}" \
  "${ENGINE_LABEL_STAMPED:-}" "${ENGINE_LABEL_REASON:-}")
AGENTSTORE=$(half "${REGISTRY}/agentstore" "label/agentstore-v${VERSION}" \
  "${AGENTSTORE_SHA:-}" "${AGENTSTORE_DIGEST:-}" "${AGENTSTORE_DISPATCHED:-}" \
  "${AGENTSTORE_LABEL_STAMPED:-}" "${AGENTSTORE_LABEL_REASON:-}")

jq -n \
  --arg tag "$TAG" \
  --arg version "$VERSION" \
  --arg base "${BASE_SHA:-}" \
  --arg run "${RUN_URL:-}" \
  --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson engine "$ENGINE" \
  --argjson agentstore "$AGENTSTORE" '{
    schema: 1,
    tag: $tag,
    version: $version,
    base_sha: (if $base == "" then null else $base end),
    recorded_at: $at,
    run_url: (if $run == "" then null else $run end),
    engine: $engine,
    agentstore: $agentstore
  }' > "$OUT"
