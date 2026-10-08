#!/usr/bin/env bash
# Boots an iPhone simulator and runs the iOS flows in Safari.
set -uo pipefail
OUT=test-results/mobile/ios
mkdir -p "$OUT"
ABS="$PWD/$OUT"   # Maestro writes screenshots/recordings relative to the flow otherwise
UDID=$(xcrun simctl list devices available -j | node -e '
  const d=JSON.parse(require("fs").readFileSync(0,"utf8")).devices;
  const all=Object.entries(d).filter(([rt])=>/iOS/.test(rt)).flatMap(([rt,ds])=>ds.map(x=>({...x,rt})));
  const pick=all.filter(x=>/^iPhone 1[5-9]( Pro)?$/.test(x.name)).pop()||all.find(x=>/^iPhone/.test(x.name));
  process.stdout.write(pick.udid);')
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl list devices | grep "$UDID" | sed 's/^ *//' > "$OUT/os-version.txt"
maestro --device "$UDID" test mobile/flows/ios \
  -e BASE_URL="$BASE_URL" -e OUT="$ABS" \
  --format junit --output "$OUT/junit.xml" \
  --debug-output "$OUT/debug"
status=$?
find "$OUT/debug" -name 'maestro.log' -exec cp {} "$OUT/maestro-log.txt" \; 2>/dev/null || true
# Maestro's failure screenshot has an emoji in its name; keep a copy with a plain name.
shot=$(find "$OUT/debug" -name '*.png' 2>/dev/null | sort | tail -1)
[ $status -ne 0 ] && [ -n "$shot" ] && cp "$shot" "$OUT/failure.png"
ls -la "$OUT"
exit $status
