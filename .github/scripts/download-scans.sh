#!/usr/bin/env bash
# Usage: download-scans.sh <region> <dir>
# Downloads the region's scans from the "scans-<region>" release into <dir>,
# skipping today and days that already have a daily aggregate in data/daily,
# unless BACKFILL is "true". Needs GH_REPO and GH_TOKEN.
set -euo pipefail

region=$1
dir=$2
mkdir -p "$dir"

if ! release_id=$(gh api "repos/${GH_REPO}/releases/tags/scans-${region}" --jq .id 2>/dev/null); then
  echo "${region}: no scans release"
  exit 0
fi

today=$(date -u +%Y%m%d)
patterns=()
while read -r name; do
  stamp=${name#scan-"${region}"-}
  day=${stamp:0:8}
  [ "$day" = "$today" ] && continue
  daily="data/daily/${region}/${day:0:4}-${day:4:2}-${day:6:2}.json.gz"
  [ "${BACKFILL:-}" != true ] && [ -f "$daily" ] && continue
  patterns+=(--pattern "$name")
done < <(gh api --paginate "repos/${GH_REPO}/releases/${release_id}/assets?per_page=100" \
  --jq ".[].name | select(startswith(\"scan-${region}-\"))")

if [ ${#patterns[@]} -gt 0 ]; then
  gh release download "scans-${region}" --dir "$dir" "${patterns[@]}"
fi
echo "${region}: $(( ${#patterns[@]} / 2 )) scans downloaded"
