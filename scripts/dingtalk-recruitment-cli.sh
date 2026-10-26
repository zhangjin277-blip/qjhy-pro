#!/bin/sh
# Runtime adapter for releases that do not yet pass --profile explicitly.
# Keep the shared DWS default account unchanged.
set -eu

if [ -z "${DINGTALK_CLI_PROFILE:-}" ]; then
  echo 'DINGTALK_CLI_PROFILE is required for recruitment synchronization' >&2
  exit 1
fi

exec /usr/local/bin/dws "$@" --profile "$DINGTALK_CLI_PROFILE"
