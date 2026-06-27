#!/bin/bash
# Push to GitHub + deploy to Studio (Mac Studio 192.168.125.101)
# Usage: ./scripts/push-deploy.sh
set -e

cd "$(dirname "$0")/.."

echo "→ Pushing to GitHub..."
git push origin master

echo "→ Deploying to Studio..."
ssh 192.168.125.101 "cd ~/hololive-card-meta && git pull origin master --ff-only"

echo "✓ Done — GitHub + Studio up to date"
