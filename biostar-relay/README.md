# Vision7 BioStar Relay

A small gateway on the club's LAN between the Vision7 CRM and BioStar 2. It signs in to BioStar with its own
account and passes the session along, so no BioStar password ever reaches a browser. No dependencies — Node.js only.

## Install (once, on the PC that stays on at the club)

1. Install Node.js LTS (https://nodejs.org) if it isn't there.
2. Copy this whole folder to the PC, e.g. `D:\Data\vision7-biostar-relay`.
3. Copy `config.env.example` to `config.env` and fill in `BIOSTAR_LOGIN` and `BIOSTAR_PASSWORD`
   (a dedicated BioStar administrator account). Leave the other values unless something changed.
   Upgrading from the first-generation relay? Copy these files **into the old relay folder** and keep its
   `config.env` and `.cert` folder: the same setting names and HTTPS certificate are reused.
4. Double-click **`install-autostart.bat`** and accept the administrator prompt.

It stops any old relay, creates the HTTPS certificate, opens the firewall port, registers the relay to start
at boot (no login needed) and to restart itself if it stops, then checks the connection.

## Everyday

| Want to | Do |
|---|---|
| Check it | Open `https://localhost:8443/relay/health` — expect `"ok":true,"reachable":true` |
| Change the BioStar password | Edit `config.env`, then double-click **`restart.bat`** |
| See what happened | `logs\relay.log` (never contains passwords) |
| Test in a window | `start.bat` |
| Remove autostart | `uninstall-autostart.bat` |

## If the health page says `ok:false`

The `error` field says why: BioStar rejected the login (fix `config.env`), or BioStar is unreachable (check the
address and that the BioStar server is on). After a rejected login the relay **pauses** login attempts for 5
minutes so it can't lock the BioStar account — fix the password, then run `restart.bat`.

## For developers

`npm test` runs the relay against a fake BioStar. Contract with the CRM: `GET /relay/health` and `/api/*`
proxied to BioStar (`vision7_crm/lib/biostar-relay.ts`).
