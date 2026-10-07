#!/bin/sh
# Warns when the root filesystem crosses the threshold.
#
# CONTRIBUTING.md calls this mandatory rather than optional: 60 GB is the first thing
# that runs out on this host, and it will run out quietly — a full disk shows up
# as Postgres refusing writes, not as a message saying the disk is full.
#
# Installed by scripts/deploy-disk-alert.sh, run from /etc/cron.d/bmf-disk-alert.
set -eu

THRESHOLD="${BMF_DISK_THRESHOLD:-75}"
USED="$(df --output=pcent / | tail -1 | tr -dc '0-9')"

[ "$USED" -lt "$THRESHOLD" ] && exit 0

MESSAGE="disk at ${USED}% of $(df -h --output=size / | tail -1 | tr -d ' ') (threshold ${THRESHOLD}%)"

# Two places on purpose: the journal is where you look when something is already
# wrong, the file is what a person notices on login.
logger -t bmf-disk "$MESSAGE"
printf '%s %s\n' "$(date -Is)" "$MESSAGE" >> /var/log/bmf-disk-alert.log

# The biggest offenders, so the next step does not start with guessing.
{
  printf 'largest directories under /var and /opt:\n'
  du -xh --max-depth=2 /var /opt 2>/dev/null | sort -rh | head -8
} >> /var/log/bmf-disk-alert.log
