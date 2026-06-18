#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ICON_SVG="$PROJECT_DIR/public/icon.svg"
ANDROID_RES="$PROJECT_DIR/android/app/src/main/res"
IOS_ASSETS="$PROJECT_DIR/ios/App/App/Assets.xcassets"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "=== Generating app icons and splash screens ==="

# --- iOS Icon ---
echo "  iOS icon (1024x1024)"
rsvg-convert -w 1024 -h 1024 "$ICON_SVG" \
  -o "$IOS_ASSETS/AppIcon.appiconset/AppIcon-512@2x.png"

# --- Android Launcher Icons (light + dark) ---
for pair in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  density="${pair%%:*}"
  size="${pair##*:}"

  dir="$ANDROID_RES/mipmap-$density"
  echo "  Android launcher $density light (${size}px)"
  rsvg-convert -w "$size" -h "$size" "$ICON_SVG" -o "$dir/ic_launcher.png"
  cp "$dir/ic_launcher.png" "$dir/ic_launcher_round.png"
done

# --- Android Adaptive Foreground Icons ---
# Pad viewBox so content occupies center 66.67% (Android safe zone)
PADDED_SVG="$TMPDIR/icon-padded.svg"
sed 's/viewBox="0 0 512 512"/viewBox="-128 -128 768 768"/' "$ICON_SVG" > "$PADDED_SVG"

for pair in mdpi:108 hdpi:162 xhdpi:216 xxhdpi:324 xxxhdpi:432; do
  density="${pair%%:*}"
  size="${pair##*:}"
  echo "  Android adaptive foreground $density (${size}px)"
  rsvg-convert -w "$size" -h "$size" "$PADDED_SVG" \
    -o "$ANDROID_RES/mipmap-$density/ic_launcher_foreground.png"
done

# --- Splash Screens ---
echo "  Generating splash base (2732x2732)"

# Build splash SVG by embedding icon centered on white background
SPLASH_SVG="$PROJECT_DIR/public/splash.svg"
ICON_INNER=$(sed '1d;$d' "$ICON_SVG")

cat > "$SPLASH_SVG" << 'HEADER'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="2732" height="2732">
  <rect fill="#ffffff" width="2732" height="2732"/>
  <g transform="translate(866,866)">
    <svg viewBox="0 0 512 512" width="1000" height="1000">
HEADER

echo "$ICON_INNER" >> "$SPLASH_SVG"

cat >> "$SPLASH_SVG" << 'FOOTER'
    </svg>
  </g>
</svg>
FOOTER

SPLASH_PNG="$TMPDIR/splash-2732.png"
rsvg-convert -w 2732 -h 2732 "$SPLASH_SVG" -o "$SPLASH_PNG"

# iOS splash (3 copies)
for f in splash-2732x2732.png splash-2732x2732-1.png splash-2732x2732-2.png; do
  cp "$SPLASH_PNG" "$IOS_ASSETS/Splash.imageset/$f"
done
echo "  iOS splash (3 copies)"

# Android splash (all variants)
for variant in drawable drawable-land-hdpi drawable-land-mdpi drawable-land-xhdpi \
  drawable-land-xxhdpi drawable-land-xxxhdpi drawable-port-hdpi drawable-port-mdpi \
  drawable-port-xhdpi drawable-port-xxhdpi drawable-port-xxxhdpi; do
  cp "$SPLASH_PNG" "$ANDROID_RES/$variant/splash.png"
done
echo "  Android splash (11 variants)"

echo "=== Done ==="
