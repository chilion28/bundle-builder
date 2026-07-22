# Moving the Image Hat dashboard to another Mac

The Image Hat production dashboard is a tiny Node web server. It currently runs on
**Web's iMac**, but it belongs on an always-on machine (e.g. the order-automation
Mac). This guide is for whoever administers that machine — it takes ~5 minutes and
does **not** interfere with anything else running there (its own launchd label,
its own port).

## What it does
Serves a web page on the office LAN listing Image Hat orders with their artwork
files, and lets the team mark editing status + notes. It reads orders from Shopify
(read-only) and saves status to a shared file. Nothing is exposed to the internet.

## Requirements on the target Mac
- **Node.js 18+** — check with `node -v`
- **The CL-MEDIA-SERVER share mounted** (for the shared status file)
- **A free TCP port** on the LAN (default 4321)
- Reachable by the team's Macs on the local network

## Steps

1. **Copy the code.** Copy the `scripts/` folder and the `.env.admin-api` file from
   `CL Media Server/WEB/Shopify/Live Site/` to the same relative location on the
   target Mac (or `git clone` the repo and drop `.env.admin-api` in the root).
   `.env.admin-api` holds the Shopify read-only token — keep it private, it is
   git-ignored.

2. **Confirm the share path.** The server saves status to
   `/Volumes/CL Media Server/WEB/AI Hat Orders/status.json`. If the share mounts at
   a different path on this Mac, edit `SHARE_DIR` near the top of
   `scripts/ai-hat-server.mjs`.

3. **Test it runs.**
   ```bash
   cd ".../Live Site"
   node scripts/ai-hat-server.mjs
   ```
   You should see "Image Hat queue live on … :4321". Open `http://localhost:4321`
   to confirm, then Ctrl+C.

4. **Find this Mac's LAN IP** (the team will use it):
   ```bash
   ipconfig getifaddr en0    # or en1 for Wi-Fi
   ```
   Ideally give this Mac a **DHCP reservation / static IP** so the address never
   changes.

5. **Keep it running** with a launchd agent. Copy
   `scripts/com.citylocs.aihat-server.plist` to
   `~/Library/LaunchAgents/` on this Mac, then edit the two absolute paths inside
   (the node binary path from `which node`, and the script path) and the
   `HOST_HINT`. Then:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.citylocs.aihat-server.plist
   launchctl list | grep aihat-server      # col 2 = 0 means healthy
   ```

6. **Prevent sleep** so the service stays up:
   ```bash
   sudo pmset -a sleep 0 disksleep 0
   ```

7. **Point the team at the new address.** Update
   `CL Media Server/WEB/AI Hat Orders/Open Image Hat Dashboard.command` and the
   README to the new IP (replace `192.168.254.67`).

8. **Turn off the old one** on Web's iMac:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.citylocs.aihat-server.plist
   ```

## Notes
- Two machines must not run it at once (they'd both write the same status.json).
  Start the new one only after stopping the old.
- The Shopify token may need refreshing someday — see `scripts/AI-HAT-ORDERS.md`
  (`node scripts/shopify-get-token.mjs`).
