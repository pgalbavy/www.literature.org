#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v hugo >/dev/null 2>&1; then
  printf '%s\n' 'Hugo is not installed. Install Hugo Extended from https://gohugo.io/installation/.' >&2
  exit 1
fi

exec hugo server --source "$repo_root/hugo" --disableFastRender
