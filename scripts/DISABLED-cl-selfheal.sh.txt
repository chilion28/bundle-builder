#!/bin/bash
#
# cl-selfheal.sh — keep the CityLocs share + dashboard/watcher healthy across
# the Mac's sleep/wake cycles, WITHOUT disabling sleep.
#
# Fixes the post-sleep failure where the SMB share reconnects as a stale +
# duplicate mount and breaks the launchd jobs whose scripts live on the share.
#
# MUST live on the LOCAL disk (it has to run when the share is down).
# Installed at: ~/Library/Scripts/cl-selfheal.sh   (reference copy: repo scripts/)

SHARE="/Volumes/CL Media Server"
PROBE="$SHARE/WEB/AI Hat Orders"
SMB_URL="smb://CL-MEDIA-SERVER._smb._tcp.local/CL%20Media%20Server"
LOG="/Users/webstation/Library/Logs/citylocs-selfheal.log"
UID_NUM="$(id -u)"
SERVICES=(com.citylocs.aihat-server com.citylocs.storefront-watch)

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "$(ts)  $*" >> "$LOG"; }

# Bounded I/O probe. A stale SMB mount can hang forever on ls, so we run it in
# the background with a hard time limit. Result is signalled via a flag FILE
# (not `wait`, which mis-reports fast-finishing reaped children — that bug made
# the previous version force-remount a healthy share every run).
share_ok() {
  local flag="/tmp/cl_share_ok.$$.$RANDOM"
  rm -f "$flag"
  ( /bin/ls "$PROBE" >/dev/null 2>&1 && : > "$flag" ) &
  local pid=$! i=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 8 ]; do sleep 1; i=$((i+1)); done
  kill -9 "$pid" 2>/dev/null
  if [ -f "$flag" ]; then rm -f "$flag"; return 0; fi
  return 1
}

remount_share() {
  log "share confirmed unreachable (2 checks) — clearing stale mounts, remounting"
  for m in "$SHARE" "$SHARE"-1 "$SHARE"-2 "$SHARE"-3; do
    if mount | grep -q " on $m "; then
      /usr/sbin/diskutil unmount force "$m" >/dev/null 2>&1 \
        || /sbin/umount -f "$m" >/dev/null 2>&1
    fi
  done
  /usr/bin/open "$SMB_URL"          # uses saved keychain creds
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
  # Share is fine — do NOT touch the mount. Only nudge a dead dashboard.
  if ! /usr/bin/curl -s -m 5 http://localhost:4321/health | grep -q ok; then
    log "share OK but dashboard down — restarting services"
    restart_services
  fi
else
  # Confirm with a second probe before doing anything disruptive — guards
  # against a transient blip force-unmounting a healthy share.
  sleep 3
  if share_ok; then
    log "share recovered on recheck — no action taken"
  else
    remount_share && restart_services
  fi
fi

tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv -f "$LOG.tmp" "$LOG" 2>/dev/null
exit 0
