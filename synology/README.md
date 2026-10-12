# Anker Prime — Synology dashboard

Installed LAN address: **http://anker.synology.local**

Responsive Russian interface for the Anker Prime A2345. Synology hosts the web server; Homey supplies the existing Anker connection and the same energy counters. Homey and the Anker cloud connection must be available. This does not add direct local Wi-Fi control of the charger.

## Functions

- All six ports: live output watts, volts and amps; shared USB-A controls clearly grouped.
- Five charging modes and five power switches (C1–C4, A1+A2).
- USB-C limits in 5 W increments, C1 5–140 W and C2–C4 15–100 W. USB-A: 0/15/24 W.
- Budget preview before applying. Other USB-C allocations decrease automatically when necessary, through the same authoritative Homey algorithm; total at most 250 W. Changing a limit activates custom mode. A saved off-step value from Anker remains visible without silently rewriting it.
- Output energy since reset, shared with Homey, reset date and explicit reset confirmation. No estimation during missing samples. A port must exist in Homey for its counter.
- Per-group shutdown timer (5-minute increments), start and stop schedules with weekdays.
- Screen brightness, all nine supported screensavers, screen timeout; encoder direction; port priority; 12/24-hour clock, holiday display and clock schedule; port names.
- Polling every 3 seconds; unavailable/stale controls disabled. Homey Flow automation and Insights history remain in Homey.

## Deployment

Files on NAS: `/volume1/docker/anker-web`. Native Synology Node.js v22; service `anker-web.service`, running as `nobody`, automatically restarted on failure and started at boot. No separate Docker container needed.

- Backend binds `127.0.0.1:8787` only.
- `/etc/nginx/conf.d/http.anker.conf` routes the requested hostname on port 80. Access restricted to `10.0.1.0/24` and loopback.
- mDNS advertises only `anker.synology.local` → `10.0.1.20` on the NAS LAN interface, independently of Synology Avahi. No router changes.
- `/usr/local/etc/rc.d/S99anker-web.sh` restores integration on boot if DSM regenerates nginx configuration. Templates are in `deploy/`.
- `config.json` is private, mode 0600, owned by the service account; never place it in public/ or Git. Homey personal access token has `homey.app.control` scope. Homey does not support a per-app PAT scope on this firmware.
- Browser receives no Anker password or Homey token. Protected Homey app endpoints `/api/app/com.ed.anker-prime/web` and `/web/control` require Homey authentication. HTTP UI is intended for the trusted home LAN, without an additional login. No WAN forwarding or public domain was configured.
- Requests enforce an exact Host/Origin allowlist and a custom header for JSON writes, without cross-origin access. Only three static assets are exposed; no arbitrary proxy paths.

Config shape (use a real token only in the private NAS file):
```json
{"homey":"http://10.0.1.50","token":"PRIVATE_HOMEY_PAT","bind":"127.0.0.1","port":8787,"origins":["http://anker.synology.local"],"mdnsAddress":"10.0.1.20"}
```

Update: copy application files (keep config.json), `npm ci --omit=dev` if dependencies change, then `sudo systemctl restart anker-web`. Check `sudo systemctl status anker-web` and `sudo journalctl -u anker-web`. On DSM updates, rerun `sudo /usr/local/etc/rc.d/S99anker-web.sh start` if needed.

Remove: stop/disable anker-web, remove its systemd unit, rc.d wrapper and nginx include, reload nginx, revoke the Homey API token named “Anker Synology dashboard”. Do not remove Homey port devices to uninstall the website: those hold the energy counters.

## Verification

`npm test` checks server-side token handling, host/origin checks and static-file isolation. Homey app tests cover the new API command allowlist and shared energy routing in addition to existing protocol, power distribution and energy tests. Live verification confirmed overview, non-mutating limit preview, invalid-limit rejection, and acknowledged writing the existing brightness setting without changing power limits, switch states or reset timestamps. Desktop and 390 px mobile layouts checked in browser.

## Port history (added 2026-10-04)

`/history` has six port tabs and power/voltage/current charts. Ranges: 1/6/24 hours and 7/30 days. Summary: integrated output Wh, peak W, charging time, and duration covered by measurements. USB-A ports are measured independently here (Homey reset counters remain shared).

The NAS samples the existing Homey app every 10 seconds independently of browser sessions. Daily JSONL files and a device catalog live in `data/`, mode0700 directory, owned by nobody. Records older than30days are purged daily. No previous Homey Insights data is imported. Queries average into up to600buckets and preserve min/max bands; short history uses the available time range. Missing samples >30s are excluded from energy/time integration; no extrapolation over outages. Historical data remains accessible if Homey is unavailable. Energy is an estimate from sampled USB output, distinct from a calibrated meter and independent of Homey counter resets.

Back up `data/` to preserve history. Do not overwrite it when deploying. Tests verify persistence, duplicate/stale sample handling, energy integration over gaps, and separate A1/A2 readings.

## Native Anker profiles and shared settings (2026-10-06)

The Synology site now uses the autonomous Docker dashboard's visual interface, while retaining the existing Homey bridge and NAS history. Homey app 0.1.14 exposes cached experimental metadata and authenticated commands for refreshing settings, toggling Maximum Compatibility/custom mode/device identification, and creating/updating/applying/deleting cloud profiles. Anker credentials remain in Homey; the site has no separate cloud-account login.

Use **Profiles Anker** beside the charging mode to manage four cloud profiles. The editor changes name, auto exit and C1–C4/shared A power budgets independently of active charging. USB-C uses 5 W steps, USB-A 0/15/24 W, total up to 250 W. Existing protocol flags are preserved. Saving does not activate a profile; use Apply. Delete has a separate confirmation panel. **Settings → Test features** contains the three shared Anker switches. Recognized model names are still unavailable through the decoded API.

Validation: 23 automatic tests passed. Live NAS→Homey→Anker verification created a temporary profile, changed C1 from 20 to 25 W and auto exit, then deleted it. Active charging mode and stored current limits remained unchanged. History queries passed. Browser verification covered the profile list/editor and experimental settings. Only public assets were replaced on NAS; existing config and history were preserved.

Disconnected ports (inactive, zero voltage and zero power) display dashes for voltage/current. Raw telemetry and energy calculations remain unchanged.

### Hybrid device identification

Homey app 0.1.15 supplies A2345 BD/BE identity fields to the bridge. USB-C cards display manufacturer and model/series from the bundled Anker table, tested VID/PID mappings, or local user entries. **Уточнить / Указать модель** saves an entry for a valid VID/PID, shared across this charger's USB-C ports. Personal port names remain under Settings → Названия. Disconnected or stale devices do not display retained model names.

Local model entries persist in `identity-models-user.json` in the configured history/data directory. Keep that file when upgrading. The NAS and autonomous dashboard databases are independent; edits are not synchronized or published. VID/PID identifies a product rather than an individual device.
