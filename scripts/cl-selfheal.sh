#!/bin/bash
#
# cl-selfheal.sh — keep the CityLocs share + dashboard/watcher healthy across
# the Mac's sleep/wake cycles, WITHOUT disabling sleep.
#
# The problem it fixes: after the iMac sleeps, the SMB share can reconnect as a
# stale + duplicate mount ("CL Media Server-1"), which breaks the launchd jobs
# whose scripts live on the share. This runs at login and every few minutes,
# detects a stale/unreachable share, remounts it cleanly, and restarts the
# services if needed.
#
# MUST live on the LOCAL disk (it has to run when the share is down).
# Installed at: ~/Library/Scripts/cl-selfheal.sh
# Reference copy kept in the repo at: scripts/cl-selfheal.sh

SHARE="/Volumes/CL Media Server"
PROBE="$SHARE/WEB/AI Hat Orders"
SMB_URL="smb://CL-MEDIA-SERVER._smb._tcp.local/CL%20Media%20Server"
LOG="/Users/webstation/Library/Logs/citylocs-selfheal.log"
UID_NUM="$(id -u)"
SERVICES=(com.citylocs.aihat-server com.citylocs.storefront-watch)

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "$(ts)  $*" >> "$LOG"; }

# Bounded I/O test — a stale SMB mount can hang forever on ls, so we run the
# check in the background and give it a hard time limit ('timeout' isn't on
# stock macOS).
share_ok() {
  ( /bin/ls "$PROBE" >/dev/null 2>&1 ) &
  local pid=$! i=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 8 ]; do sleep 1; i=$((i+1)); done
  if kill -0 "$pid" 2>/dev/null; then kill -9 "$pid" 2>/dev/null; return 1; fi
  wait "$pid" 2>/dev/null
}

remount_share() {
  log "share unreachable — clearing stale mounts and remounting"
  # Force-unmount the primary and any duplicate remounts (-1, -2, …).
  for m in "$SHARE" "$SHARE"-1 "$SHARE"-2 "$SHARE"-3; do
    if mount | grep -q " on $m "; then
      /usr/sbin/diskutil unmount force "$m" >/dev/null 2>&1 \
        || /sbin/umount -f "$m" >/dev/null 2>&1
    fi
  done
  # Remount via Finder so it uses Diane's saved keychain credentials (no
  # password stored in this script).
  /usr/bin/open "$SMB_URL"
  # Give it time to come up.
  local i=0
  while [ "$i" -lt 15 ]; do
    sleep 2
    if share_ok; then log "share remounted OK"; return 0; fi
    i=$((i+1))
  done
  log "remount did not come back within ~30s"
  return 1
}

restart_services() {
  for svc in "${SERVICES[@]}"; do
    launchctl kickstart -k "gui/$UID_NUM/$svc" >/dev/null 2>&1
  done
  log "kicked services: ${SERVICES[*]}"
}

# ---- main ----
if share_ok; then
  # Share is fine. Just make sure the dashboard is actually answering; if a
  # service died for another reason, bring it back (cheap, no-op if healthy).
  if ! /usr/bin/curl -s -m 5 http://localhost:4321/health | grep -q ok; then
    log "share OK but dashboard not responding — restarting services"
    restart_services
  fi
else
  remount_share && restart_services
fi

# Keep the log from growing forever.
tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv -f "$LOG.tmp" "$LOG" 2>/dev/null
exit 0
