#!/usr/bin/env bash
# Deletes scan assets older than 29 days from the "scans" release. The API
# terms (2(t)) allow 30 days; the margin covers delayed or skipped runs.
# Needs GH_REPO and GH_TOKEN.
set -euo pipefail

cutoff=$(date -u -d '29 days ago' +%Y%m%dT%H%MZ)
if ! release_id=$(gh api "repos/${GH_REPO}/releases/tags/scans" --jq .id 2>/dev/null); then
  echo "No scans release"
  exit 0
fi

deleted=0
while read -r id name; do
  # scan-eu-20261127T0617Z.json.gz -> 20261127T0617Z
  stamp=${name##*-}
  stamp=${stamp%.json.gz}
  if [[ "$stamp" < "$cutoff" ]]; then
    gh api -X DELETE "repos/${GH_REPO}/releases/assets/${id}"
    echo "Deleted ${name}"
    deleted=$((deleted + 1))
  fi
done < <(gh api --paginate "repos/${GH_REPO}/releases/${release_id}/assets?per_page=100" --jq '.[] | "\(.id) \(.name)"')
echo "${deleted} scans older than ${cutoff} deleted"
