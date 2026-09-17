#!/bin/bash
# Starts a care script (start.sh, celery_worker.sh). With the m2 profile, ABDM callbacks
# first get the tunnel's public URL unless ABDM_CALLBACK_BASE_URL is already set.
set -eo pipefail

if [ -z "${ABDM_CALLBACK_BASE_URL}" ] && getent hosts tunnel > /dev/null; then
  echo "Waiting for the tunnel's public URL..."
  for _ in $(seq 1 60); do
    hostname=$(curl -fsS http://tunnel:2000/quicktunnel 2> /dev/null \
      | python -c 'import json, sys; print(json.load(sys.stdin)["hostname"])' 2> /dev/null || true)
    if [ -n "${hostname}" ]; then
      export ABDM_CALLBACK_BASE_URL="https://${hostname}"
      echo "ABDM callbacks reach this setup at ${ABDM_CALLBACK_BASE_URL}/api/abdm"
      break
    fi
    sleep 2
  done
fi

exec bash "$@"
