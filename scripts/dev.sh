#!/usr/bin/env bash
# macOS Bash 3.2 and Linux: Python owns locking, signals and child cleanup.
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec "${CQA_SUPERVISOR_PYTHON:-python3}" "$repo_dir/scripts/dev.py"
