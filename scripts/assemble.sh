#!/bin/sh
# Assemble the sagestage.app site into site/: the landing + workshop pages from
# THIS repo, and the taster at try/ built from a checkout of HeutaLab/SageStage
# exactly the way its own copy-dist.sh builds dist/ (derive the file list from
# index.html, never hand-maintain it), plus the runtime-fetched directories.
# Then inject demo.js into try/index.html — the ONLY place it ever exists.
#
# Usage: sh scripts/assemble.sh <path-to-SageStage-checkout>
set -eu
SRC=${1:?path to SageStage checkout}
cd "$(dirname "$0")/.."

OUT=site
rm -rf "$OUT"
mkdir -p "$OUT/try" "$OUT/workshop"

cp index.html site.css "$OUT/"
cp workshop/index.html "$OUT/workshop/"

# ---- the taster: same derivation copy-dist.sh uses, pointed at the checkout
cp "$SRC/index.html" "$OUT/try/"
ASSETS=$(grep -oE '(src|href)="[^"]*"' "$SRC/index.html" \
  | sed -E 's/^[a-z]+="//; s/"$//' \
  | grep -v '^data:' | grep -v '^https\?://' | grep -v '^//' | grep -v '^#' \
  | sed 's/?.*$//' | sort -u)
MISSING=0
for f in $ASSETS; do
  if [ -f "$SRC/$f" ]; then
    mkdir -p "$OUT/try/$(dirname "$f")"
    cp "$SRC/$f" "$OUT/try/$f"
  else
    echo "assemble: referenced by index.html but not in checkout: $f" >&2
    MISSING=1
  fi
done
[ "$MISSING" -eq 0 ] || { echo "assemble: refusing to ship a broken taster" >&2; exit 1; }
# runtime-fetched directories (invisible to the index.html parse — see the
# SageStage repo's copy-dist.sh for the audit that established this list)
[ -d "$SRC/community" ] && cp -R "$SRC/community" "$OUT/try/"
[ -d "$SRC/vendor" ] && { rm -rf "$OUT/try/vendor"; cp -R "$SRC/vendor" "$OUT/try/"; }

# ---- the demo flag: inject before storage.js, exactly like the repo's own
# mock harness does; BSD/GNU sed portability via a temp file
cp demo.js "$OUT/try/demo.js"
sed 's|<script src="storage.js|<script src="demo.js"></script>\n  <script src="storage.js|' \
  "$OUT/try/index.html" > "$OUT/try/index.html.tmp"
mv "$OUT/try/index.html.tmp" "$OUT/try/index.html"
grep -q 'demo.js' "$OUT/try/index.html" || { echo "assemble: demo.js injection failed" >&2; exit 1; }

echo "assemble: $(find "$OUT" -type f | wc -l | tr -d ' ') files into $OUT/"
