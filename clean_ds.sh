#!/usr/bin/env bash
###############################################################################
# purge_ds_store.sh
# Recursively remove all .DS_Store files from a directory tree.
#
# Usage:
#   ./purge_ds_store.sh [PATH]
#   If PATH is omitted, the current working directory (.) is used.
###############################################################################

set -euo pipefail

# Resolve target directory (defaults to current directory)
TARGET_DIR="${1:-.}"

# Verify that the path exists and is a directory
if [[ ! -d "$TARGET_DIR" ]]; then
  printf 'Error: %s is not a valid directory.\n' "$TARGET_DIR" >&2
  exit 1
fi

# Recursively find and delete .DS_Store (case‑insensitive on macOS/HFS+)
# -iname makes the match case‑insensitive; -type f ensures only files
# -print lists each file before removal for transparency
find "$TARGET_DIR" -type f \( -iname '.DS_Store' -o -iname '.ds_store' \) \
    -print -delete