#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
TOKEN="$1"
if [ -z "$TOKEN" ]; then echo "Usage: ./push_fixes.sh <github_token>"; exit 1; fi
git config user.email "agent@replit.com"
git config user.name "Replit Agent"
git remote set-url origin "https://${TOKEN}@github.com/darapet/smartquiz-system.git"
git add -A
git commit -m "Fix: all library bugs — footer visibility, Firestore rules, AI on text books, real-time followers count"
git push origin HEAD
echo "Done — pushed to GitHub."
