#!/bin/bash
set -e

KEYSTORE_PROPS="${1:-./keystore.properties}"

if [ ! -f "$KEYSTORE_PROPS" ]; then
    echo "Error: keystore.properties not found at $KEYSTORE_PROPS"
    echo "Usage: $0 [/path/to/keystore.properties]"
    exit 1
fi

VERSION="${VERSION:-$(node -p "require('./package.json').version")}"
TAG="v$VERSION"

echo "Building version $VERSION ($TAG)"

# Check if this tag already exists
if git tag -l "$TAG" | grep -q "$TAG"; then
    echo "Error: Tag $TAG already exists. Bump the version in package.json first."
    exit 1
fi

read -s -p "Enter keystore password: " STORE_PASS
echo

echo "Building web assets..."
pnpm build

echo "Syncing to Android..."
pnpm cap sync android

echo "Building signed APK..."
ANDROID_STORE_PASSWORD="$STORE_PASS" \
ANDROID_KEY_PASSWORD="$STORE_PASS" \
    ./android/gradlew -p android assembleRelease \
    -PkeystorePropertiesFile="$KEYSTORE_PROPS"

APK_BUILD_PATH="android/app/build/outputs/apk/release/app-release.apk"

if [ ! -f "$APK_BUILD_PATH" ]; then
    echo "Error: APK not found at $APK_BUILD_PATH"
    exit 1
fi

APK_PATH="android/app/build/outputs/apk/release/formstr-calendar-${VERSION}.apk"
cp "$APK_BUILD_PATH" "$APK_PATH"

echo ""
echo "APK built: $APK_PATH"
read -p "Create GitHub release $TAG? [y/N] " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    git tag "$TAG"
    git push origin "$TAG"
    gh release create "$TAG" "$APK_PATH" \
        --title "$TAG" \
        --generate-notes
    echo "Release $TAG created!"
else
    echo "Skipped GitHub release. APK is at: $APK_PATH"
    echo "To release manually later:"
    echo "  git tag $TAG && git push origin $TAG"
    echo "  gh release create $TAG $APK_PATH --title $TAG --generate-notes"
fi
