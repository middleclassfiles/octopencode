#!/usr/bin/env bash
# Hydra one-click installer for macOS and Linux.
set -euo pipefail

cd "$(dirname "$0")"

echo ""
echo "============================================================"
echo "  Hydra - one-click installer"
echo "============================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  [ERROR] Node.js was not found on PATH."
  echo "          Install Node.js 22+ from https://nodejs.org,"
  echo "          then run this installer again."
  echo ""
  exit 1
fi

node scripts/install.mjs
exit_code=$?

echo ""
if [ "$exit_code" -ne 0 ]; then
  echo "  Installer finished with errors. See the messages above."
  echo "  You can run it again once the problems are fixed."
  echo ""
  exit "$exit_code"
fi

echo "  Installer finished. Open a NEW terminal window, then run:"
echo ""
echo "      hydra"
echo ""
echo "  from the project directory you want to orchestrate."
echo ""
exit 0
