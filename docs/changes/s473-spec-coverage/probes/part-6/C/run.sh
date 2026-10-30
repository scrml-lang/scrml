#!/bin/bash
# usage: run.sh name  (compiles name.scrml to out-name/)
cd /home/bmacs/scrmlMaster/scrml
P=~/.cache/scrml-agent-tmp/spec-coverage-audit/probes-6/C
for n in "$@"; do echo "=== $n"; rm -rf $P/out-$n; timeout 60 bun scripts/scrml-boot.ts compile $P/$n.scrml --output-dir $P/out-$n 2>&1 | grep -E "^(error|warning|info|✓|✗)" | cut -c1-230; echo "exit=${PIPESTATUS[0]}"; done
