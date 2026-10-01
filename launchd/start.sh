#!/bin/sh
# launchd entry point. The atlas.remote basic_auth hashes come from onenv caddy-dev, never from
# this repo — it is public: CADDY_DEV_AUTH_HASH gates dev previews, CADDY_SERVICE_AUTH_HASH the
# console. Without one the daemon still serves; it only writes no atlas.remote half for that kind
# (authHashFor in src/lib/hostnames/registry.ts).
hash() { onenv get caddy-dev "$1" --json | jq -r '.value // empty'; }
CADDY_DEV_AUTH_HASH=$(hash CADDY_DEV_AUTH_HASH)
CADDY_SERVICE_AUTH_HASH=$(hash CADDY_SERVICE_AUTH_HASH)
[ -n "$CADDY_DEV_AUTH_HASH" ] && [ -n "$CADDY_SERVICE_AUTH_HASH" ] ||
  echo "start.sh: an auth hash is missing from onenv — its atlas.remote half stays off until the next start" >&2
export CADDY_DEV_AUTH_HASH CADDY_SERVICE_AUTH_HASH
exec bun build/index.js
