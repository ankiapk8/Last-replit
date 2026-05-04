#!/usr/bin/env bash
# Build a self-contained Capacitor APK that bundles the AnkiGen frontend.
# The APK still calls the backend at $API_BASE for AI generation, decks, etc.
#
# Required env:
#   API_BASE   — public https URL of the API (e.g. https://app.replit.app/api)
# Optional env:
#   APK_OUT    — output APK path (default: artifacts/anki-generator/public/anki-cards.apk)
#   META_OUT   — output metadata json path (default: APK_OUT + ".json")

set -euo pipefail
cd "$(dirname "$0")/.."

API_BASE="${API_BASE:-https://${REPLIT_DEV_DOMAIN}/api}"
HOST=$(echo "$API_BASE" | sed -E 's#https?://([^/]+).*#\1#')

APK_OUT="${APK_OUT:-artifacts/anki-generator/public/anki-cards.apk}"
META_OUT="${META_OUT:-${APK_OUT}.json}"

# Force a usable JDK 21 (Android Gradle Plugin requires Java 17+, prefer 21)
JDK21=$(ls -d /nix/store/*-openjdk-21* 2>/dev/null | head -1 || true)
if [ -n "$JDK21" ] && [ -x "$JDK21/bin/java" ]; then
  JAVA_HOME="$JDK21"
elif [ -z "${JAVA_HOME:-}" ] || [ ! -x "${JAVA_HOME}/bin/java" ]; then
  JAVA_HOME=$(ls -d /nix/store/*-openjdk-1[78]* 2>/dev/null | head -1 || true)
fi
export JAVA_HOME
export ANDROID_HOME=/home/runner/android-sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

echo "==> JDK: $JAVA_HOME"
echo "==> Android SDK: $ANDROID_HOME"
echo "==> Building web bundle (API_BASE=$API_BASE)"
( cd artifacts/anki-generator && PORT=5000 VITE_API_BASE="$API_BASE" BASE_PATH="/" pnpm build )

echo "==> Cleaning APK artifacts from web bundle"
rm -f artifacts/anki-generator/dist/public/anki-cards*.apk \
      artifacts/anki-generator/dist/public/anki-cards*.apk.idsig \
      artifacts/anki-generator/dist/public/anki-cards*.apk.json

echo "==> Syncing to Android project"
( cd artifacts/anki-generator && pnpm exec cap sync android )

echo "==> Building signed release APK"
( cd artifacts/anki-generator/android && ./gradlew assembleRelease )

APK_SRC=artifacts/anki-generator/android/app/build/outputs/apk/release/app-release.apk
mkdir -p "$(dirname "$APK_OUT")"
cp "$APK_SRC" "$APK_OUT"
SIZE=$(stat -c%s "$APK_OUT")
SOURCE_HASH="${ANKIGEN_SOURCE_HASH:-}"

cat > "$META_OUT" <<EOF
{
  "targetUrl": "https://$HOST",
  "host": "$HOST",
  "additionalHosts": [],
  "packageId": "app.replit.ankigen",
  "versionName": "2.0-bundled",
  "versionCode": 2,
  "sizeBytes": $SIZE,
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "kind": "bundled",
  "apiBase": "$API_BASE",
  "sourceHash": "$SOURCE_HASH"
}
EOF
rm -f "${APK_OUT}.idsig"

echo "==> Done: $APK_OUT ($(du -h "$APK_OUT" | cut -f1))"
