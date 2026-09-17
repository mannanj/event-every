#!/usr/bin/env bash
# Pull the private real-image eval set into scripts/eval-images/real/.
#
# The images are the owner's own scan history and carry names and emails, so
# they live in a private R2 bucket rather than this public repo. Anyone logged
# in to the Cloudflare account with wrangler can restore them:
#
#   ./scripts/pull-real-eval-images.sh
#   EVAL_ONLY=real-01,real-02 bun scripts/measure-scan-reliability.ts 1
#
# Upload side, after adding or relabeling cases locally:
#
#   ./scripts/pull-real-eval-images.sh --push

set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="event-every-eval-private"
PREFIX="real"
DEST="scripts/eval-images/real"

if [[ "${1:-}" == "--push" ]]; then
  count=0
  for path in "$DEST"/*; do
    name="$(basename "$path")"
    wrangler r2 object put "$BUCKET/$PREFIX/$name" --file "$path" --remote >/dev/null
    count=$((count + 1))
  done
  echo "pushed $count files to r2://$BUCKET/$PREFIX/"
  exit 0
fi

mkdir -p "$DEST"
# The answer key names every image, so it is the manifest.
wrangler r2 object get "$BUCKET/$PREFIX/cases.json" --remote --file "$DEST/cases.json" >/dev/null
wrangler r2 object get "$BUCKET/$PREFIX/BASELINE.md" --remote --file "$DEST/BASELINE.md" >/dev/null
count=0
for name in $(grep -o '"image": *"[^"]*"' "$DEST/cases.json" | sed -E 's/.*"real\/([^"]+)"/\1/'); do
  wrangler r2 object get "$BUCKET/$PREFIX/$name" --remote --file "$DEST/$name" >/dev/null
  count=$((count + 1))
done
echo "pulled $count images plus cases.json and BASELINE.md into $DEST/"
