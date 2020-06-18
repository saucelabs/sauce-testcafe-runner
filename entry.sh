#!/usr/bin/env bash

# set -e: exit asap if a command exits with a non-zero status
set -e

echoerr() { printf "%s\n" "$*" >&2; }

# print error and exit
die () {
  echoerr "ERROR: $1"
  # if $2 is defined AND NOT EMPTY, use $2; otherwise, set to "150"
  errnum=${2-188}
  exit $errnum
}

exec 3>&1

if [ "${DEBUG}" == "bash" ]; then
  run-supervisord.sh &
  cd /var/log/cont
  exec bash
fi

if [ "${CI}" != "true" ]; then
  exec run-supervisord.sh
fi

sleep 2