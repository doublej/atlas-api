#!/bin/sh
# launchd entry point. The atlas.remote basic_auth hash comes from onenv (caddy-dev
# CADDY_DEV_AUTH_HASH), never from this repo — it is public. Without it the daemon still
# serves; it only writes no atlas.remote half (renderSiteBlock in src/lib/hostnames/nas.ts).
CADDY_DEV_AUTH_HASH=$(onenv get caddy-dev CADDY_DEV_AUTH_HASH --json | jq -r '.value // empty')
[ -n "$CADDY_DEV_AUTH_HASH" ] || echo "start.sh: no CADDY_DEV_AUTH_HASH from onenv — atlas.remote stays off until the next start" >&2
export CADDY_DEV_AUTH_HASH
exec bun build/index.js
