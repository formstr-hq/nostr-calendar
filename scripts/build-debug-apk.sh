#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -p "require('./package.json').version")"
APK="android/app/build/outputs/apk/debug/app-debug.apk"
ZIP="nostr-calendar-${VERSION}-debug-android.zip"

pnpm build
pnpm cap sync android
./android/gradlew -p android assembleDebug

if [[ ! -f "$APK" ]]; then
  printf 'Error: debug APK not found at %s\n' "$APK" >&2
  exit 1
fi

jar --create --no-manifest --file "$ZIP" \
  -C android/app/build/outputs/apk/debug app-debug.apk

unzip -t "$ZIP"

printf '\nDebug Android artifacts:\n'
stat -c '  %n (%s bytes)' "$APK" "$ZIP"
sha256sum "$APK" "$ZIP"
