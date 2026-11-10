#!/bin/sh
set -eu
if [ -n "${PUSH_DATA_DIR:-}" ]; then
  mkdir -p "$PUSH_DATA_DIR"
  chown node:node "$PUSH_DATA_DIR"
fi
exec su node -s /bin/sh -c 'exec node /app/server.js'
