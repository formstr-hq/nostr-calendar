#!/usr/bin/env bash
# Run all Maestro native E2E tests.
#
# Usage:
#   pnpm test:e2e:native          (runs setup + Maestro + teardown)
#   pnpm test:e2e:native:quick    (skip APK rebuild, emulator + relay already running)
#
# Options:
#   --skip-build   Skip relay start and APK rebuild (relay + emulator already up)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RELAY_DIR="$SCRIPT_DIR/../relay"

SKIP_BUILD=false
for arg in "$@"; do
  [[ "$arg" == "--skip-build" ]] && SKIP_BUILD=true
done

# Alice's nsec (derived from fixed seed — see e2e/relay/seed/keys.ts)
# seed: aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0001
ALICE_NSEC="${ALICE_NSEC:-nsec1424qqq924gqqp242qqq242sqqz425qqq424qqq924gqqp242qqqsjfy523}"

# ── Emulator ────────────────────────────────────────────────────────────────
AVD="${AVD:-Medium_Phone_API_36.1}"

if ! adb devices | grep -q "emulator"; then
  echo "▶ Starting emulator ($AVD)..."
  emulator -avd "$AVD" -no-snapshot-load -no-audio &
  EMULATOR_PID=$!

  echo "▶ Waiting for emulator to boot..."
  adb wait-for-device
  until adb shell getprop sys.boot_completed 2>/dev/null | grep -q "1"; do
    sleep 2
  done
  # Give the launcher a moment to settle
  sleep 3
  echo "▶ Emulator ready."
else
  echo "▶ Emulator already running."
fi

if [[ "$SKIP_BUILD" == false ]]; then
  echo "▶ Starting relay..."
  docker compose -f "$RELAY_DIR/docker-compose.yml" up -d

  echo "▶ Seeding relay..."
  cd "$PROJECT_DIR"
  node --loader ts-node/esm e2e/native/setup.ts 2>/dev/null || \
    pnpm tsx e2e/native/setup.ts

  echo "▶ Building test APK (relay: ws://10.0.2.2:7777)..."
  VITE_TEST_RELAY=ws://10.0.2.2:7777 pnpm build
  pnpm cap sync android
  (cd "$PROJECT_DIR/android" && ./gradlew assembleDebug)

  APK="$PROJECT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
  echo "▶ Installing APK..."
  adb install -r "$APK"

  echo "▶ Granting notification permission..."
  adb shell pm grant app.formstr.calendar android.permission.POST_NOTIFICATIONS || true
fi

echo "▶ Clearing delivered notifications (prevents stale notifications from prior runs)..."
adb shell service call notification 1 || true

echo "▶ Running Maestro flows..."
cd "$PROJECT_DIR"
maestro test \
  --env "ALICE_NSEC=$ALICE_NSEC" \
  e2e/native/flows/notifications.yaml

EXIT_CODE=$?

if [[ "$SKIP_BUILD" == false ]]; then
  echo "▶ Stopping relay..."
  docker compose -f "$RELAY_DIR/docker-compose.yml" down
fi

exit $EXIT_CODE
