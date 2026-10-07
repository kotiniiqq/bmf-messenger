#!/bin/sh
# Keeps the parent devices cgroup of Docker wide enough for new containers.
#
# The daemon writes the whitelist at /sys/fs/cgroup/devices/docker once, when it
# starts, from the device nodes present at that moment. Devices the host gains
# afterwards are missing from it, and since a cgroup v1 child can never exceed
# its parent, runc then fails to create *every* new container:
#
#   error setting cgroup config for procHooks process:
#   failed to write "c 10:200 rwm": .../devices.allow: operation not permitted
#
# This is not hypothetical. The provider enabled TUN/TAP on 2026-08-02 while
# checking ports, /dev/net/tun (10:200) appeared, and from that moment nothing
# could start on the host — no build, not `docker run alpine true`, and not one
# container of the beta stack had it been restarted. The stack kept running only
# because those containers had been created two days earlier.
#
# So the ceiling is re-derived from /dev after every start of the daemon, rather
# than patched for one device: the next thing the provider enables must not take
# the host down again.
#
# Two constraints the kernel imposes here, both found the hard way:
#   * `a *:* rwm` is refused (EIO) once the cgroup has children, and it always
#     has — the running containers are its children.
#   * `c *:* rwm` and `b *:* rwm` are refused too. Only exact major:minor rules
#     are accepted, hence the enumeration below.
#
# This grants nothing to anybody: it raises the ceiling only. What a container
# may actually touch is decided by its own cgroup, which the daemon still writes
# and this script never touches.
#
# Installed by scripts/deploy-device-ceiling.sh, run from
# docker-device-ceiling.service after every start of the daemon.
set -eu

CGROUP=/sys/fs/cgroup/devices/docker

# cgroup v2 drops the devices controller and this whole failure mode with it.
[ -d /sys/fs/cgroup/devices ] || exit 0

# Normally the daemon has already created this; create it if we got here first.
[ -d "$CGROUP" ] || mkdir -p "$CGROUP"

widen() {
  target="$1"
  granted=0
  refused=0

  # -xdev keeps us out of /dev/pts, /dev/shm and /dev/mqueue, which are separate
  # mounts full of nodes no container needs.
  for node in $(find /dev -xdev \( -type c -o -type b \) 2>/dev/null); do
    # %F is the human-readable type, %t and %T are the major and minor in hex.
    meta="$(stat -c '%F %t %T' "$node" 2>/dev/null)" || continue

    kind="${meta% * *}"
    minor_hex="${meta##* }"
    major_hex="${meta% *}"
    major_hex="${major_hex##* }"

    case "$kind" in
      character*) type=c ;;
      block*) type=b ;;
      *) continue ;;
    esac

    # A device with no major is not addressable by a cgroup rule.
    [ -n "$major_hex" ] || continue

    major="$(printf '%d' "0x$major_hex" 2>/dev/null)" || continue
    minor="$(printf '%d' "0x$minor_hex" 2>/dev/null)" || continue

    # A refusal is normal: the VE does not own every node it can see. Only the
    # ones it does own matter, and those are the ones runc will ask for.
    if echo "$type $major:$minor rwm" > "$target/devices.allow" 2>/dev/null; then
      granted=$((granted + 1))
    else
      refused=$((refused + 1))
    fi
  done

  logger -t bmf-device-ceiling "ceiling on $target: $granted granted, $refused refused"
}

widen "$CGROUP"

# buildkit gets its own cgroup between the daemon's and the build container's,
# and it is created once and then reused — so it keeps whatever ceiling was in
# force the first time a build ran, long after the parent has been widened. Miss
# it and builds keep failing with the same error while `docker run` works, which
# is exactly how much time this cost the first time.
if [ -d "$CGROUP/buildkit" ]; then
  widen "$CGROUP/buildkit"
fi

# A container the daemon failed to *create* stays down: the restart policy covers
# processes that exited, not containers that never came into being. Bringing the
# stack up is what lets an unattended reboot recover without a person — but only
# when something is actually missing, so a routine daemon restart does not
# recreate healthy containers behind our back.
COMPOSE=/opt/bmf/bmf-infra/compose/beta.yml
[ -f "$COMPOSE" ] || exit 0

want="$(docker compose -f "$COMPOSE" config --services 2>/dev/null | wc -l)"
have="$(docker compose -f "$COMPOSE" ps --status running -q 2>/dev/null | wc -l)"

if [ "$want" -gt 0 ] && [ "$have" -lt "$want" ]; then
  logger -t bmf-device-ceiling "only $have/$want services up, starting the stack"
  docker compose -f "$COMPOSE" up -d || logger -t bmf-device-ceiling "compose up failed"
fi
