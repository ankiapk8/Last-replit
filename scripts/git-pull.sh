#!/bin/bash
set -e

TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN:-$GITHUB_TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "No GitHub token found (GITHUB_PERSONAL_ACCESS_TOKEN or GITHUB_TOKEN). Skipping pull."
  exit 0
fi

cat > /tmp/git-askpass.sh << 'ASKPASS'
#!/bin/bash
echo "$GIT_TOKEN"
ASKPASS
chmod +x /tmp/git-askpass.sh

BRANCH=$(git --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
echo "Pulling from https://github.com/ankiapk8/Ankiapk10 (branch: $BRANCH)"

GIT_TOKEN="$TOKEN" GIT_ASKPASS=/tmp/git-askpass.sh GIT_TERMINAL_PROMPT=0 \
  git pull https://ankiapk8@github.com/ankiapk8/Ankiapk10.git "${BRANCH}" --rebase 2>&1

echo "Successfully pulled from GitHub: $BRANCH"
