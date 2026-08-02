---
name: build-debug-apk
description: Build and ZIP the nostr-calendar Android debug APK. Use when asked to build, regenerate, package, archive, or share a debug APK for Android testing.
allowed-tools: Bash(pnpm:*), Bash(unzip:*), Bash(sha256sum:*), Bash(stat:*), Bash(git:*)
---

# build-debug-apk

Build the current app as a debug-signed Android APK and package it in a
versioned ZIP at the repository root.

## Run

From the repository root, use the project's single build command:

```bash
pnpm build-android
```

This command runs lint and type checking, builds the production web assets,
syncs them into Capacitor Android, assembles the debug APK, creates a versioned
ZIP, validates the archive, and prints file sizes and SHA-256 checksums.

Expected outputs for the current package version:

```text
android/app/build/outputs/apk/debug/app-debug.apk
nostr-calendar-<version>-debug-android.zip
```

The ZIP must contain exactly one file named `app-debug.apk`.

## Failure Handling

- Stop if `pnpm build-android` fails. Do not package or report an older APK.
- Do not use the release build or request signing credentials. Android's
  standard debug signing is intentional.
- Inspect `git status --short` afterward and report tracked changes produced by
  Capacitor sync. Do not revert unrelated changes.
