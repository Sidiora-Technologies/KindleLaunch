#!/usr/bin/env bash
# coverage-gate.sh — enforce the KindleLaunch coverage gate (SECTION 17).
#
# Reads per-module coverage profiles from .cover/<module-with-slashes-as-_>.out
# (produced by `make cover`) and fails if any module is below its threshold:
#   - money / correctness-critical modules : 90%   (env MONEY="shared protocol ...")
#   - all other modules                    : 85%
#
# Modules with no measurable statements yet (empty scaffold) are reported and
# skipped — the gate bites as soon as a module ships code.
set -euo pipefail

COVER_DIR="${COVER_DIR:-.cover}"
DEFAULT_MIN="${DEFAULT_MIN:-85.0}"
MONEY_MIN="${MONEY_MIN:-90.0}"
MONEY="${MONEY:-}"

if [ ! -d "$COVER_DIR" ]; then
	echo "coverage-gate: no $COVER_DIR directory (run 'make cover' first)" >&2
	exit 1
fi

fail=0
shopt -s nullglob
profiles=("$COVER_DIR"/*.out)
if [ ${#profiles[@]} -eq 0 ]; then
	echo "coverage-gate: no coverage profiles found in $COVER_DIR" >&2
	exit 1
fi

is_money() {
	local mod="$1" m
	for m in $MONEY; do [ "$m" = "$mod" ] && return 0; done
	return 1
}

printf '%-26s %8s %8s   %s\n' "MODULE" "COVER" "MIN" "STATUS"
printf '%-26s %8s %8s   %s\n' "------" "-----" "---" "------"

for prof in "${profiles[@]}"; do
	base="$(basename "$prof" .out)"
	# Reverse the slash->underscore mapping (each module path has at most one slash).
	mod="${base/_//}"

	# A profile with only the "mode:" header has no statements (empty module).
	if [ "$(wc -l <"$prof")" -le 1 ]; then
		printf '%-26s %8s %8s   %s\n' "$mod" "n/a" "-" "SKIP (no code yet)"
		continue
	fi

	pct="$(go tool cover -func="$prof" | awk '/^total:/ {gsub(/%/,"",$3); print $3}')"
	if [ -z "$pct" ]; then
		printf '%-26s %8s %8s   %s\n' "$mod" "n/a" "-" "SKIP (no statements)"
		continue
	fi

	if is_money "$mod"; then min="$MONEY_MIN"; else min="$DEFAULT_MIN"; fi

	if awk -v p="$pct" -v m="$min" 'BEGIN{exit !(p+0 >= m+0)}'; then
		printf '%-26s %7s%% %7s%%   %s\n' "$mod" "$pct" "$min" "PASS"
	else
		printf '%-26s %7s%% %7s%%   %s\n' "$mod" "$pct" "$min" "FAIL"
		fail=1
	fi
done

if [ "$fail" -ne 0 ]; then
	echo "" >&2
	echo "coverage-gate: FAILED — one or more modules below threshold" >&2
	exit 1
fi
echo ""
echo "coverage-gate: PASSED"
