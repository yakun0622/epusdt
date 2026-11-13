#!/usr/bin/env bash
# W61 LOCAL-ONLY release/rollback rehearsal. NEVER points at live paths.
set -euo pipefail
cd "$(dirname "$0")/../.."
test -f src/www/index.html || { echo "legacy asset missing"; exit 1; }
test -f src/www/manifest.webmanifest || { echo "legacy PWA manifest missing"; exit 1; }
test -f web/dist/index.html || { echo "W61 requires npm run build in web/"; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
case "$tmp" in /tmp/*|/var/tmp/*) ;; *) echo "W61 refuses non-temporary work area: $tmp"; exit 1;; esac
# All copies are into the one disposable directory. src/www is READ ONLY.
cp -a src/www "$tmp/live"
initial="$(sha256sum "$tmp/live/index.html" | awk '{print $1}')"
manifest="$(sha256sum "$tmp/live/manifest.webmanifest" | awk '{print $1}')"
mv "$tmp/live" "$tmp/rollback"
cp -a web/dist "$tmp/live"
if cmp -s "$tmp/live/index.html" "$tmp/rollback/index.html"; then
  echo "No rollout differential visible, refusing rehearsal"; exit 1
fi
test ! -f "$tmp/live/manifest.webmanifest" || {
  echo "Candidate already ships manifest; update PWA gate after review"; exit 1;
}
# Emulated rollback: move only our temp backup, no Go server or SQL changes.
rm -rf "$tmp/live"
mv "$tmp/rollback" "$tmp/live"
test "$(sha256sum "$tmp/live/index.html" | awk '{print $1}')" = "$initial"
test "$(sha256sum "$tmp/live/manifest.webmanifest" | awk '{print $1}')" = "$manifest"
cmp -s src/www/index.html "$tmp/live/index.html"
cmp -s src/www/manifest.webmanifest "$tmp/live/manifest.webmanifest"
cat > W61-ROLLBACK-DRILL.md <<EOF
# W61 disposable-directory rollback exercise: PASS

- Input: read-only committed src/www/ and built web/dist/
- Stage: unique mktemp directory only, never the production Go embedding
- Snapshot SHA256 of src/www/index.html: $initial
- Snapshot SHA256 of src/www/manifest.webmanifest: $manifest
- Exercise: copied old assets → swapped to new dist → restored old backup
- Result: old entrypoint + manifest SHA256 equal after rollback; original paths untouched
- IMPORTANT: Same-origin browser SW cache migration, live DB schema/backup, release-routing and production rollback remain **BLOCKED** pending independent staging rehearsal
EOF
cat W61-ROLLBACK-DRILL.md
