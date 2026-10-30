#!/bin/bash
# usage: run.sh <dir>
D=$(cd "$1" && pwd)
for f in "$D"/*.scrml; do b=$(basename $f .scrml); echo "=== $b"; (cd /home/bmacs/scrmlMaster/scrml; bun scripts/scrml-boot.ts compile "$f" --output-dir "$D/out-$b" --format line 2>&1 | sed "s|$D/||" | cut -c1-300 | head -${N:-5}); done
