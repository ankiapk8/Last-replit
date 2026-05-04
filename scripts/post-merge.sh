#!/bin/bash
set -e

pnpm install --frozen-lockfile

bash scripts/git-pull.sh || echo "Pull step skipped or failed (non-fatal)"

bash scripts/git-push.sh
