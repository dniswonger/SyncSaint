#!/usr/bin/env bash
# Pull/push the encrypted state file to a dedicated branch.
#   STATE_REPO    owner/repo holding the state (default: this repo)
#   STATE_BRANCH  branch name (default: syncsaint-state)
#   STATE_TOKEN   token with contents:write on STATE_REPO (default in workflows: GITHUB_TOKEN)
# The file is AES-256-GCM encrypted; the branch never contains plaintext tokens.
set -euo pipefail

cmd="${1:?usage: state.sh pull|push}"
repo="${STATE_REPO:-${GITHUB_REPOSITORY:?}}"
branch="${STATE_BRANCH:-syncsaint-state}"
dir=".state"
url="https://x-access-token:${STATE_TOKEN:?}@github.com/${repo}.git"

case "$cmd" in
  pull)
    rm -rf "$dir"
    if git ls-remote --exit-code --heads "$url" "$branch" >/dev/null 2>&1; then
      git clone --quiet --depth 1 --branch "$branch" "$url" "$dir"
      echo "Loaded state from ${branch}"
    else
      mkdir -p "$dir"
      git -C "$dir" init --quiet -b "$branch"
      git -C "$dir" remote add origin "$url"
      echo "No state branch yet; starting fresh"
    fi
    ;;
  push)
    cd "$dir"
    [ -f state.enc ] || { echo "No state file to push"; exit 0; }
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add state.enc
    if git diff --cached --quiet; then
      echo "State unchanged"
      exit 0
    fi
    git commit --quiet -m "state: update $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    git push --quiet origin "HEAD:${branch}"
    echo "State saved"
    ;;
  *)
    echo "unknown command: $cmd" >&2
    exit 2
    ;;
esac
