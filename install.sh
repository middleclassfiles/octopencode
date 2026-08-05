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
  if command -v brew >/dev/null 2>&1; then
    echo "  Node.js was not found. Installing via Homebrew..."
    brew install node
  elif command -v apt-get >/dev/null 2>&1; then
    echo "  Node.js was not found. Installing via apt..."
    sudo apt-get update
    sudo apt-get install -y nodejs npm
  elif command -v dnf >/dev/null 2>&1; then
    echo "  Node.js was not found. Installing via dnf..."
    sudo dnf install -y nodejs npm
  else
    echo "  [ERROR] Node.js was not found and no supported package manager is available."
    echo "          Install Node.js 22+ from https://nodejs.org, then run:"
    echo "          ./install.sh"
    echo ""
    exit 1
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "  [ERROR] Node.js is still not available. Open a NEW terminal and re-run:"
  echo "          ./install.sh"
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