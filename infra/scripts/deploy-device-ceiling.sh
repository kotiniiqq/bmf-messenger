#!/bin/sh
# Installs docker-device-ceiling.sh and its unit on the host, and applies the fix
# immediately. Idempotent — safe to re-run after every deploy.
#
# Run as root on the VPS:
#   sh /opt/bmf/bmf-infra/scripts/deploy-device-ceiling.sh
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"

install -m 755 "$HERE/docker-device-ceiling.sh" /usr/local/sbin/docker-device-ceiling.sh
install -m 644 "$HERE/docker-device-ceiling.service" \
  /etc/systemd/system/docker-device-ceiling.service

systemctl daemon-reload
systemctl enable --now docker-device-ceiling.service

# Proof rather than a claim: if a throwaway container starts, the ceiling is up.
docker run --rm alpine:latest true && echo 'device ceiling OK: containers can start'
