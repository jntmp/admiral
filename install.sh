#!/usr/bin/env bash
# Install the admiral fleet distro so Copilot CLI can find it.
#
#   ./install.sh --user            -> ~/.copilot/agents  +  ~/.copilot/fleet/doctrine
#   ./install.sh --repo /path/repo -> <repo>/.github/agents + <repo>/.github/fleet/doctrine
#
# Repo-level wins over user-level when both exist, matching the resolution
# order the agent profiles use.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() { sed -n '2,8p' "$0" | sed 's/^# \?//'; exit "${1:-0}"; }
[ $# -gt 0 ] || usage 1

case "$1" in
  --user)
    AGENTS="${COPILOT_HOME:-$HOME}/.copilot/agents"
    DOCTRINE="${COPILOT_HOME:-$HOME}/.copilot/fleet/doctrine"
    ;;
  --repo)
    [ $# -eq 2 ] || usage 1
    REPO="$(cd "$2" && pwd)"
    [ -d "$REPO/.git" ] || { echo "not a git repository: $REPO" >&2; exit 1; }
    AGENTS="$REPO/.github/agents"
    DOCTRINE="$REPO/.github/fleet/doctrine"
    ;;
  -h|--help) usage 0 ;;
  *) usage 1 ;;
esac

mkdir -p "$AGENTS" "$DOCTRINE"
cp "$SRC"/agents/*.agent.md "$AGENTS"/
cp "$SRC"/doctrine/*.md     "$DOCTRINE"/

echo "agents   -> $AGENTS"
ls -1 "$SRC"/agents   | sed 's/^/             /'
echo "doctrine -> $DOCTRINE"
ls -1 "$SRC"/doctrine | sed 's/^/             /'
echo
echo "Launch with:  copilot --agent admiral"
