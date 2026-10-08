#!/usr/bin/env bash
# Runs inside the booted Android emulator (android-emulator-runner `script`).
set -uo pipefail
OUT=test-results/mobile/android
mkdir -p "$OUT"
ABS="$PWD/$OUT"   # Maestro writes screenshots/recordings relative to the flow otherwise
# Skip Chrome's first-run screens (emulator images are debuggable, so Chrome reads this file).
adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell am force-stop com.android.chrome || true
adb shell getprop ro.build.version.release > "$OUT/os-version.txt"
maestro test mobile/flows/android \
  -e BASE_URL="$BASE_URL" -e OUT="$ABS" \
  --format junit --output "$OUT/junit.xml" \
  --debug-output "$OUT/debug"
status=$?
# Maestro's log as .txt so the console's evidence route can serve it.
find "$OUT/debug" -name 'maestro.log' -exec cp {} "$OUT/maestro-log.txt" \; 2>/dev/null || true
# Maestro's failure screenshot has an emoji in its name; keep a copy with a plain name.
shot=$(find "$OUT/debug" -name '*.png' 2>/dev/null | sort | tail -1)
[ $status -ne 0 ] && [ -n "$shot" ] && cp "$shot" "$OUT/failure.png"
ls -la "$OUT"
exit $status
