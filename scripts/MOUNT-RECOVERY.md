# Share / dashboard recovery (manual — self-heal was retired)

The automated self-heal job (`com.citylocs.selfheal`) was **disabled on 2026-07-24**.
It force-unmounted the share to "fix" it, which triggered repeated macOS login
prompts — more disruptive than the problem it solved. We chose the simpler path:
occasional manual nudge.

(The old script is kept only for reference as `DISABLED-cl-selfheal.sh.txt`.
Do NOT re-enable it without redesigning the remount to never force-unmount a
healthy share.)

## When to use
Some mornings after the iMac sleeps, the dashboard shows stale data or the share
feels disconnected. Fix in ~10 seconds:

## Steps
1. **If the share is disconnected** (Finder can't see CL Media Server):
   Finder sidebar → click **CL Media Server** to remount (or Go → Connect to
   Server → `smb://CL-MEDIA-SERVER._smb._tcp.local/CL Media Server`).
   The keychain has the password saved, so it reconnects without asking.
2. **Nudge the services** so they pick the share back up:
   ```bash
   bash ~/Library/Scripts/cl-nudge.sh
   ```
   It only restarts the dashboard + watcher — it never touches the mount.

That's it. Dashboard should show a fresh "data refreshed" time.

## Or just ask Claude
In a Claude Code chat: "the dashboard looks stale, nudge it" — same 10-second fix.
