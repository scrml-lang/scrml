#!/bin/bash
# usage: run.sh name  (reads name.scrml)
D=/home/bmacs/.cache/scrml-agent-tmp/spec-coverage-audit/probes-1/s5
cd /home/bmacs/scrmlMaster/scrml
for n in "$@"; do
  echo "=== $n"
  bun scripts/scrml-boot.ts compile $D/$n.scrml --output-dir $D/out/$n 2>&1 | grep -E '^(error|warning) \[|✗|✓|wrote' | cut -c1-260
  echo "EXIT ${PIPESTATUS[0]}"
done
