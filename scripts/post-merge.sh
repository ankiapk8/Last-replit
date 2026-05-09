#!/bin/bash
set -e

pnpm install --frozen-lockfile

bash scripts/git-push.sh
