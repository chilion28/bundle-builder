#!/bin/bash
# Regenerate the AI Hat production queue and publish it to the shared server so
# the team always has a current copy without running anything themselves.
#
# Driven by the launchd agent com.citylocs.aihat-orders (every 10 minutes).
# Run it by hand any time to force a refresh:
#     ./scripts/ai-hat-orders-sync.sh

set -uo pipefail

REPO="/Volumes/CL Media Server/WEB/Shopify/Live Site"

# Where the team picks it up. Change this one line to move the report.
SHARE_DIR="/Volumes/CL Media Server/WEB/AI Hat Orders"

DAYS=60
NODE="/usr/local/bin/node"
LOG="$REPO/scripts/out/sync.log"

mkdir -p "$REPO/scripts/out"
stamp() { date '+%Y-%m-%d %H:%M:%S'; }

# The share lives on a network volume — if it isn't mounted, fail loudly in the
# log rather than silently writing the report somewhere nobody looks.
if [ ! -d "$(dirname "$SHARE_DIR")" ]; then
  echo "$(stamp)  SKIP — server not mounted ($(dirname "$SHARE_DIR"))" >> "$LOG"
  exit 0
fi

mkdir -p "$SHARE_DIR"

cd "$REPO" || { echo "$(stamp)  FAIL — repo not reachable" >> "$LOG"; exit 1; }

# Write to a temp file first, then move into place, so the team never opens a
# half-written report.
TMP="$REPO/scripts/out/ai-hat-orders.html"
if OUTPUT=$("$NODE" scripts/ai-hat-orders.mjs --days "$DAYS" --out "$TMP" --csv 2>&1); then
  mv -f "$TMP" "$SHARE_DIR/ai-hat-orders.html"
  [ -f "${TMP%.html}.csv" ] && mv -f "${TMP%.html}.csv" "$SHARE_DIR/ai-hat-orders.csv"
  echo "$(stamp)  OK — $(echo "$OUTPUT" | grep -o '[0-9]\+ AI Hat item' | head -1)" >> "$LOG"
else
  echo "$(stamp)  FAIL — $(echo "$OUTPUT" | tr '\n' ' ' | cut -c1-200)" >> "$LOG"
  exit 1
fi

# Keep the log from growing forever.
tail -n 500 "$LOG" > "$LOG.tmp" && mv -f "$LOG.tmp" "$LOG"
