#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Lint rule: check for unsafe optional-chain method call patterns
#
# Detects:          value?.method(...).anotherMethod(...)
#                    ^--- optional chain   ^--- called on potentially undefined
#
# Safe:             value?.method(...)?.anotherMethod(...)
#                     ^--- optional chain  ^--- guarded with ?.
#
# The pattern `?.method(...).anotherMethod(...)` is ALWAYS unsafe because the
# first optional chain can return undefined, and the second method is called
# on that undefined — causing "Cannot read properties of undefined" crashes.
#
# Usage:
#   bash scripts/check-optional-chain-safety.sh
#   # Returns exit code 0 if no violations, 1 if any found
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail
IFS=$'\n\t'

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Regex: ?.identifier(...).identifier(
PATTERN='\?\.\w+\([^)]*\)\.\w+\('

if command -v rg &>/dev/null; then
  SEARCH_CMD='rg'
  # rg output: filepath:linenum:content
  OUTPUT=$("$SEARCH_CMD" -n --glob '*.ts' --glob '*.tsx' \
    --glob '!node_modules/**' --glob '!dist/**' --glob '!.git/**' \
    --glob '!*.test.ts' --glob '!*.test.tsx' --glob '!*.snap' \
    "$PATTERN" . 2>/dev/null || true)
else
  # grep fallback
  SEARCH_CMD='grep'
  OUTPUT=$(find . -type f \( -name '*.ts' -o -name '*.tsx' \) \
    -not -path './node_modules/*' -not -path './dist/*' -not -path './.git/*' \
    -not -name '*.test.ts' -not -name '*.test.tsx' -not -name '*.snap' \
    -exec grep -rn "$PATTERN" {} + 2>/dev/null || true)
fi

VIOLATIONS_FILE=$(mktemp)

# Process matched lines
if [ -n "$OUTPUT" ]; then
  while IFS=: read -r file linenum rest; do
    [ -z "$file" ] && continue
    # Skip if line appears to be binary or empty
    echo "${file}:${linenum}" >> "$VIOLATIONS_FILE"
  done <<< "$OUTPUT"
fi

if [ -s "$VIOLATIONS_FILE" ]; then
  COUNT=$(sort -u < "$VIOLATIONS_FILE" | wc -l | tr -d ' ')
  echo "❌ Found ${COUNT} unsafe optional-chain method call(s)!"
  echo ""
  echo "Pattern:     ?.method(...).anotherMethod(...)  (UNSAFE)"
  echo "Should be:   ?.method(...)?.anotherMethod(...)  (SAFE)"
  echo ""
  echo "Locations:"
  echo ""
  while IFS=: read -r file line; do
    rel="${file#./}"
    echo "  • $rel:$line"
  done < <(sort -u "$VIOLATIONS_FILE")
  echo ""
  echo "Fix each by adding ?. before the second method call."
  rm "$VIOLATIONS_FILE"
  exit 1
fi

rm "$VIOLATIONS_FILE"
echo "✅ No unsafe optional-chain method calls found."
exit 0

# Report
if [ -s "$VIOLATIONS_FILE" ]; then
  COUNT=$(wc -l < "$VIOLATIONS_FILE" | tr -d ' ')
  echo "❌ Found ${COUNT} unsafe optional-chain method call(s)!"
  echo ""
  echo "The pattern:     ?.method(...).anotherMethod(...)"
  echo "Should be:       ?.method(...)?.anotherMethod(...)"
  echo "                         ^-- add ?. before the second method call"
  echo ""
  echo "Affected locations:"
  echo ""
  while IFS=: read -r file line match; do
    # Show relative path
    rel_path="${file#./}"
    echo "  • $rel_path:$line"
    echo "    Pattern: $match"
    echo ""
  done < "$VIOLATIONS_FILE"
  echo "---"
  echo "Fix each occurrence by adding ?. before the second method call."
  echo ""
  rm "$VIOLATIONS_FILE"
  exit 1
fi

rm "$VIOLATIONS_FILE"
echo "✅ No unsafe optional-chain method calls found."
exit 0
