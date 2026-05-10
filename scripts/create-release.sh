#!/bin/bash
set -e

CURRENT_VERSION=$(node -p "require('./package.json').version")

echo "Current version: $CURRENT_VERSION"
echo ""
echo "Select release type:"
echo "  1) patch"
echo "  2) minor"
echo "  3) major"
read -p "Enter choice [1-3]: " CHOICE

case "$CHOICE" in
    1) RELEASE_TYPE="patch" ;;
    2) RELEASE_TYPE="minor" ;;
    3) RELEASE_TYPE="major" ;;
    *) echo "Invalid choice: $CHOICE"; exit 1 ;;
esac

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$RELEASE_TYPE" in
    major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
    minor) NEW_VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
    patch) NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
esac

echo ""
echo "Bumping version: $CURRENT_VERSION → $NEW_VERSION ($RELEASE_TYPE)"
read -p "Proceed? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

BRANCH="release/v${NEW_VERSION}"

echo ""
echo "Checking out master and pulling latest..."
git checkout master
git pull origin master

if git ls-remote --exit-code --heads origin "$BRANCH" &>/dev/null; then
    echo "Error: branch '$BRANCH' already exists on origin."
    exit 1
fi

echo "Creating branch $BRANCH..."
git checkout -b "$BRANCH"

echo "Updating package.json..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
pkg.version = '${NEW_VERSION}';
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"

git add package.json
git commit -m "chore: bump version to ${NEW_VERSION}"

echo "Pushing branch to origin..."
git push -u origin "$BRANCH"

echo ""
echo "Creating PR..."
PR_URL=$(gh pr create \
    --title "Release v${NEW_VERSION}" \
    --body "Bump version from \`${CURRENT_VERSION}\` to \`${NEW_VERSION}\` (${RELEASE_TYPE} release)." \
    --base master \
    --head "$BRANCH")

echo "PR: $PR_URL"

echo "Merging PR..."
gh pr merge "$PR_URL" --merge --delete-branch

echo "Pulling merged master..."
git checkout master
git pull origin master

echo ""
echo "Done. v${NEW_VERSION} is on master."
